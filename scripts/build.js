#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const rootDir = path.resolve(__dirname, '..');
const docsDir = path.join(rootDir, 'docs');
const templatesDir = path.join(rootDir, 'templates');
const pagesDir = path.join(templatesDir, 'pages');
const partialsDir = path.join(templatesDir, 'partials');

const layoutTemplate = readFile(path.join(templatesDir, 'layout.html'));
const partials = {
  header: readFile(path.join(partialsDir, 'header.html')),
  footer: readFile(path.join(partialsDir, 'footer.html')),
  loginModal: readFile(path.join(partialsDir, 'login-modal.html')),
};

const DEFAULT_IMAGES = {
  og: '/assets/media/social-share.jpg',
  twitter: '/assets/media/social-share.jpg',
};

const files = fs.readdirSync(pagesDir).filter((file) => file.endsWith('.html'));

files.forEach((file) => {
  const filePath = path.join(pagesDir, file);
  const { frontMatter, content } = parseTemplate(filePath);
  const meta = prepareMeta(frontMatter);
  const header = buildHeader(partials.header, frontMatter.currentPage || 'home');
  const replacements = {
    ...meta,
    HEADER: header,
    FOOTER: partials.footer,
    LOGIN_MODAL: partials.loginModal,
    CONTENT: content.trim() ? `\n${content.trim()}\n` : '',
  };

  let output = layoutTemplate;
  for (const [key, value] of Object.entries(replacements)) {
    output = output.replace(new RegExp(`{{${key}}}`, 'g'), value);
  }

  if (output.includes('{{')) {
    throw new Error(`Unresolved template token in output for ${file}`);
  }

  const outputPath = path.join(docsDir, frontMatter.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, output);
  console.log(`Built ${frontMatter.output}`);
});

function readFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function parseTemplate(filePath) {
  const raw = readFile(filePath);
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    throw new Error(`Missing front matter in ${filePath}`);
  }

  const frontMatter = JSON.parse(match[1]);
  const content = match[2];
  if (!frontMatter.output) {
    throw new Error(`Missing "output" in front matter for ${filePath}`);
  }
  if (!frontMatter.title) {
    throw new Error(`Missing "title" in front matter for ${filePath}`);
  }

  return { frontMatter, content };
}

function prepareMeta(frontMatter) {
  const description = frontMatter.description || '';
  const ogImage = frontMatter.ogImage || DEFAULT_IMAGES.og;
  const twitterImage = frontMatter.twitterImage || frontMatter.ogImage || DEFAULT_IMAGES.twitter;

  return {
    TITLE: frontMatter.title,
    DESCRIPTION: description,
    OG_TITLE: frontMatter.ogTitle || frontMatter.title,
    OG_DESCRIPTION: frontMatter.ogDescription || description,
    OG_IMAGE: ogImage,
    TWITTER_TITLE: frontMatter.twitterTitle || frontMatter.title,
    TWITTER_DESCRIPTION: frontMatter.twitterDescription || description,
    TWITTER_IMAGE: twitterImage,
    HTML_ATTRIBUTES: frontMatter.htmlAttributes || 'lang="en"',
    BODY_CLASS: frontMatter.bodyClass || 'body',
    EXTRA_HEAD: (frontMatter.extraHead || '').trim(),
  };
}

function buildHeader(baseHeader, currentPage) {
  let header = baseHeader;

  if (currentPage !== 'home') {
    header = header.replace(/ aria-current="page"/g, '');
    header = header.replace(/ w--current/g, '');
  }

  const navTargets = {
    brands: [
      {
        search: 'href="/brands/" class="nav_link w-nav-link"',
        replace: 'href="/brands/" class="nav_link w-nav-link w--current" aria-current="page"',
      },
      {
        search: 'href="/brands/" class="mobile-nav_link"',
        replace: 'href="/brands/" class="mobile-nav_link w--current" aria-current="page"',
      },
    ],
    retailers: [
      {
        search: 'href="/retailers/" class="nav_link w-nav-link"',
        replace: 'href="/retailers/" class="nav_link w-nav-link w--current" aria-current="page"',
      },
      {
        search: 'href="/retailers/" class="mobile-nav_link"',
        replace: 'href="/retailers/" class="mobile-nav_link w--current" aria-current="page"',
      },
    ],
    catalog: [
      {
        search: 'href="/catalog/" class="nav_link w-nav-link"',
        replace: 'href="/catalog/" class="nav_link w-nav-link w--current" aria-current="page"',
      },
      {
        search: 'href="/catalog/" class="mobile-nav_link"',
        replace: 'href="/catalog/" class="mobile-nav_link w--current" aria-current="page"',
      },
    ],
  };

  const targets = navTargets[currentPage];
  if (targets) {
    targets.forEach(({ search, replace }) => {
      header = header.replace(search, replace);
    });
  }

  return header;
}
