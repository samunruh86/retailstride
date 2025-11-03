// core/gcs.js
// Helper around Cloud Run signer for GET/PUT signed URLs
// -----------------------------------------------

const BASE_ENDPOINT = "https://trigger-2gb-616502391258.us-central1.run.app";
const SIGNER_ENDPOINT = `${BASE_ENDPOINT}/get_signed_url`;
const DEFAULT_BUCKET  = "amazon-377817";
const BUCKET_TRIGGER = "blob-trigger-2gb";

// ----------------------------------------------
export async function checkFileExists(path) {
  // Basic validation
  if (!path || typeof path !== "string") {
    throw new Error("checkFileExists: PATH must be a non-empty string");
  }

  try {
    const resp = await fetch(BASE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      mode: "cors",
      cache: "no-store",
      body: JSON.stringify({
        action: "file_exists",
        args: { PATH: path }
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(`checkFileExists: bad response ${resp.status} ${text}`);
    }

    const data = await resp.json();
    // assuming your backend returns something like { exists: true/false }
    const exists = Boolean(data?.exists);

    console.log(`checkFileExists: ${exists} | ${path}`);
    return exists;
  } catch (err) {
    console.error("checkFileExists: network error:", err?.message || err);
    throw new Error(`checkFileExists: network error: ${String(err?.message || err)}`);
  }
}

// More robust existence check with fallbacks to signer HEAD and GET
export async function robustFileExists(path) {
  if (!path || typeof path !== "string") throw new Error("robustFileExists: PATH must be a non-empty string");
  // 1) Preferred: backend file_exists
  try {
    const exists = await checkFileExists(path);
    if (exists) return true;
  } catch {}
  // 2) Signer HEAD: cheap metadata check
  try {
    const signed = await getSignedUrl({ filename: path, method: "HEAD" });
    if (!signed.ok && signed.status === "not_found") return false;
    if (signed.ok && signed.url) {
      const head = await fetch(signed.url, { method: "HEAD" });
      if (head.ok) return true;
      if (head.status === 404) return false;
    }
  } catch {}
  // 3) GET JSON: expensive but definitive
  try {
    const js = await fetchJsonFromGCS(path);
    return js != null;
  } catch {}
  return false;
}
// ----------------------------------------------
export async function uploadMetaToGCS(
  metaObj,
  path,
  {
    endpoint = BASE_ENDPOINT,
    action = "meta_to_return",
    headers = { "Content-Type": "application/json" },
    timeoutMs = 10000,
    vrbs = 1
  } = {}
) {
  // Basic validation
  if (!metaObj || typeof metaObj !== "object") {
    throw new Error("metaToGCS: META must be a non-null object");
  }
  if (!path || typeof path !== "string") {
    throw new Error("metaToGCS: PATH must be a non-empty string");
  }

  const payload = {action, args: { META: metaObj, PATH: path }};

  if (vrbs > 0) {console.log("metaToGCS: POST", endpoint, "| payload:", payload);}

  // Timeout support
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let resp;
  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal
    });
  } catch (err) {
    clearTimeout(t);
    console.error("metaToGCS: network error:", err?.message || err);
    throw new Error(`metaToGCS: network error: ${String(err?.message || err)}`);
  }
  clearTimeout(t);

  // Handle non-2xx responses
  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("metaToGCS: HTTP error", resp.status, text);
    throw new Error(`metaToGCS: HTTP ${resp.status}${text ? ` - ${text}` : ""}`);
  }
  return true;
}
// ----------------------------------------------

// ----------------------------------------------
export async function deleteGCS(path) {
  const endpoint = BASE_ENDPOINT;
  const action = "delete_file";
  const headers = { "Content-Type": "application/json" };
  const timeoutMs = 10000;

  if (!path || typeof path !== "string") {
    throw new Error("deleteGCS: PATH must be a non-empty string");
  }

  const payload = { action, args: { PATH: path } };
  console.log("deleteGCS: POST", endpoint, "| payload:", payload);

  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let resp;

  try {
    resp = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: ac.signal
    });
  } catch (err) {
    clearTimeout(t);
    console.error("deleteGCS: network error:", err?.message || err);
    throw new Error(`deleteGCS: network error: ${String(err?.message || err)}`);
  }
  clearTimeout(t);

  if (!resp.ok) {
    const text = await resp.text().catch(() => "");
    console.error("deleteGCS: HTTP error", resp.status, text);
    throw new Error(`deleteGCS: HTTP ${resp.status}${text ? ` - ${text}` : ""}`);
  }

  return true;
}
// ----------------------------------------------

// ----------------------------------------------
export async function triggerCloudRun({
  action = "site_sync",
  args = {},
  bucket = BUCKET_TRIGGER
} = {}) {

  const payload = { ACTION: action, args };
  const filename = `trigger/${action}-${Date.now()}.json`;

  try {
    await jsonToGCS(payload, filename, bucket);
    try { console.log(`CloudRun | ${action} | ${bucket} -> ${filename}`); } catch {}
    return { ok: true, bucket, filename };
  } catch (err) {
    console.warn(`CloudRun | ${action} | trigger error:`, err?.message || err);
    throw err;
  }
}
// ----------------------------------------------

// ----------------------------------------------
function safeJson(resp) {
  return resp.json().catch(() => ({}));
}
// ----------------------------------------------

// ----------------------------------------------
export async function jsonToGCS(jsObj, filename, bucket = null) {
  const contentType = "application/json";
  const useBucket = bucket && String(bucket).trim() !== "" ? bucket : DEFAULT_BUCKET;

  const signed = await getSignedUrl({
    filename,
    method: "PUT",
    bucket: useBucket,
    contentType
  });

  // For PUT, signer should always provide a URL (object may not exist yet — that's fine).
  if (!signed?.ok || !signed?.url) {
    throw new Error(`jsonToGCS: signer failed (status=${signed?.status || "unknown"})`);
  }

  // Build headers (respect any required signer headers, but allow us to set Content-Type)
  const headers = {
    ...(signed.requiredHeaders || {}),
    "Content-Type": contentType,
  };

  const put = await fetch(signed.url, {
    method: "PUT",
    headers,
    body: JSON.stringify(jsObj)
  });

  if (!put.ok) {
    const text = await put.text().catch(() => "");
    console.error("GCS PUT failed", put.status, text?.slice?.(0, 300) || text);
    throw new Error(`GCS PUT ${put.status}${text ? ` | ${text.slice(0, 200)}` : ""}`);
  }
  return true;
}
// ----------------------------------------------

// ----------------------------------------------
/**
 * Request a signed URL from the Cloud Run signer.
 * Success returns { ok: true, url, fileExists, status, requiredHeaders }.
 * If the file is missing for GET/HEAD, returns { ok: false, url: null, fileExists: false, status: "not_found" }.
 * Other non-OK responses throw (network/config issues).
 */
async function getSignedUrl({
  filename,
  method = "GET",
  bucket = DEFAULT_BUCKET,
  contentType,
}) {
  if (!filename) throw new Error("getSignedUrl: filename required");

  const body = {
    action: "get_signed_url",
    bucket,
    filename,
    method,
    exp_minutes: 10
  };
  if ((method === "PUT" || method === "POST") && contentType) {
    body.content_type = contentType;
  }

  const res = await fetch(SIGNER_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    mode: "cors",
    cache: "no-store",
    body: JSON.stringify(body)
  });

  // Handle 404 from signer (our backend now returns this when the object is missing for GET/HEAD)
  if (res.status === 404) {
    const js = await safeJson(res);
    // Expected backend shape: { status: "not_found", signedUrl: null, fileExists: false, ... }
    if (js?.status === "not_found") {
      return {
        ok: false,
        url: null,
        fileExists: false,
        status: "not_found",
        requiredHeaders: js?.requiredHeaders || {}
      };
    }
    // Unexpected 404 payload -> still treat as not found but log it
    console.warn("Signer 404 with unexpected body:", js);
    return { ok: false, url: null, fileExists: false, status: "not_found", requiredHeaders: {} };
  }

  // Any other non-OK is a hard failure (auth/network/misconfig). Surface it.
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Signer HTTP ${res.status}${txt ? ` | ${txt}` : ""}`);
  }

  const js = await safeJson(res);

  // Success path — we expect a signedUrl
  if (!js?.signedUrl) {
    // Defensive: if signer replied 200 but no URL, treat as a soft failure so callers can branch
    // (This should be rare — keep a console warning to catch misconfigurations.)
    console.warn("Signer response missing signedUrl:", js);
    return {
      ok: false,
      url: null,
      fileExists: Boolean(js?.fileExists),
      status: js?.status || "unknown",
      requiredHeaders: js?.requiredHeaders || {}
    };
  }

  return {
    ok: true,
    url: js.signedUrl,
    fileExists: Boolean(js?.fileExists),
    status: js?.status || "success",
    requiredHeaders: js?.requiredHeaders || {}
  };
}
// ----------------------------------------------

// ----------------------------------------------
/**
 * Fetch JSON from GCS. Returns parsed JSON or null when the object does not exist.
 * Does NOT throw for missing objects. Throws for unexpected signer/storage failures.
 */
export async function fetchJsonFromGCS(filename) {
  try {
    const signed = await getSignedUrl({ filename, method: "GET" });

    // If signer reports the object is missing, return null gracefully.
    if (!signed.ok && signed.status === "not_found") {
      return null;
    }
    // If signer did not provide a URL for some other reason, escalate.
    if (!signed.ok || !signed.url) {
      throw new Error(`Signer failed: status=${signed.status}`);
    }

    const resp = await fetch(signed.url, { method: "GET" });

    if (resp.ok) {
      return await resp.json().catch(() => null);
    }

    // Storage replied non-OK. Handle common 404 bodies as null; otherwise raise.
    const raw = await resp.text().catch(() => "");
    const body = (raw || "").slice(0, 300);
    const is404 = resp.status === 404 || /NoSuchKey/i.test(body) || /No such object/i.test(body);
    if (is404) {
      return null;
    }

    console.warn("[GCS] GET failed", resp.status, filename, body);
    throw new Error(`GCS HTTP ${resp.status}`);
  } catch (err) {
    console.warn("[GCS] GET exception", filename, err?.message || err);
    // For client flows, returning null is the most ergonomic "safe" behavior for missing/unavailable
    // data. If you want to distinguish temporary failures vs not-found, consider returning
    // { ok:false, notFound:boolean, error?:string } instead of `null`.
    return null;
  }
}
// ----------------------------------------------
