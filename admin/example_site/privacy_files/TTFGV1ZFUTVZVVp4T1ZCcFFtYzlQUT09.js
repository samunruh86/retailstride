const embedStr = 'policies.termageddon.com/api/embed/';
const polKey = 'TTFGV1ZFUTVZVVp4T1ZCcFFtYzlQUT09';
var termageddonPolicy = document.getElementById(polKey);
const scriptTags = Array.from(document.querySelectorAll(`script`));
let firstEmbedDiv = null;
let extraEmbedsFound = false;

scriptTags.forEach(scriptTag => {
    const src = scriptTag.getAttribute('src');
    if (src && src.includes(embedStr)) {
      const embedIdFromSrc = src.substring(src.lastIndexOf('/') + 1, src.lastIndexOf('.js'));
      const embedDiv = document.getElementById(embedIdFromSrc);

      if (embedDiv) {
        if (!firstEmbedDiv) {
          firstEmbedDiv = embedDiv;
        } else {
          extraEmbedsFound = true;
          embedDiv.style.display = 'none';
          embedDiv.style.width = '1px';
          embedDiv.style.height = '1px';
          scriptTag.setAttribute('src', 'about:blank');
        }
      }
    }
});
if (extraEmbedsFound && firstEmbedDiv) {
    const noticeDiv = document.createElement('div');
    noticeDiv.textContent = 'Please input only one embed code per page.';
    noticeDiv.style.position = 'fixed';
    noticeDiv.style.left = '50%';
    noticeDiv.style.top = '200px';
    noticeDiv.style.transform = 'translateX(-50%)';
    noticeDiv.style.backgroundColor = 'rgba(255, 255, 255, 0.8)';
    noticeDiv.style.padding = '20px';
    noticeDiv.style.border = '1px solid #ccc';
    noticeDiv.style.borderRadius = '5px';
    noticeDiv.style.fontSize = '24px';
    noticeDiv.style.color = 'red';
    noticeDiv.style.zIndex = '1000';
    document.body.appendChild(noticeDiv);
}

var xhr = new XMLHttpRequest();

xhr.onload = function () {
    
    termageddonPolicy.innerHTML = xhr.responseText;
}

xhr.onerror = function () {
    
    let reqHeader = new Headers();
    reqHeader.append('Content-Type', 'text/html');

    let initObject = { method: 'GET', headers: reqHeader, };

    var userRequest = new Request("https://embed.termageddon.com/api/render/TTFGV1ZFUTVZVVp4T1ZCcFFtYzlQUT09?origin="+window.location.href, initObject);

    fetch(userRequest)
        .then(function (response) {
            return response.text();
        })
        .then(function (data) {
            
                termageddonPolicy.innerHTML = data;
        })
        .catch(function (err) {
            
                termageddonPolicy.innerHTML = "There was an error loading this policy, please <a href='https://embed.termageddon.com/api/policy/TTFGV1ZFUTVZVVp4T1ZCcFFtYzlQUT09?origin="+window.location.href+"'>click here</a> to view it.";
        });
}

xhr.open("GET", "https://embed.termageddon.com/api/render/TTFGV1ZFUTVZVVp4T1ZCcFFtYzlQUT09?origin="+window.location.href);
xhr.send();
