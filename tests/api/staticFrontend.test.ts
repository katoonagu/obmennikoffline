import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { registerMiniAppStaticFrontend } from '../../src/api/staticFrontend.js';

describe('Mini App static frontend routes', () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), 'obmen-miniapp-static-'));
    await mkdir(join(rootDir, 'frontend'), { recursive: true });
    await mkdir(join(rootDir, 'assets'), { recursive: true });
    await writeFile(
      join(rootDir, 'frontend', 'index.html'),
      '<!doctype html><script type="module" src="/assets/index.js"></script>',
      'utf8',
    );
    await writeFile(
      join(rootDir, 'frontend', 'admin.html'),
      '<!doctype html><script type="module" src="/assets/admin.js"></script>',
      'utf8',
    );
    await writeFile(join(rootDir, 'assets', 'index.js'), 'console.log("miniapp");', 'utf8');
    await writeFile(join(rootDir, 'assets', 'style.css'), '.screen{display:block}', 'utf8');
  });

  afterEach(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it('serves built Mini App and Admin App HTML plus Vite assets from the API process', async () => {
    const app = Fastify();
    registerMiniAppStaticFrontend(app, { rootDir });

    const miniAppResponse = await app.inject({ method: 'GET', url: '/frontend/' });
    const adminResponse = await app.inject({ method: 'GET', url: '/frontend/admin.html' });
    const scriptResponse = await app.inject({ method: 'GET', url: '/assets/index.js' });
    const cssResponse = await app.inject({ method: 'GET', url: '/assets/style.css' });

    expect(miniAppResponse.statusCode).toBe(200);
    expect(miniAppResponse.headers['content-type']).toContain('text/html');
    expect(miniAppResponse.body).toContain('/assets/index.js');
    expect(adminResponse.statusCode).toBe(200);
    expect(adminResponse.body).toContain('/assets/admin.js');
    expect(scriptResponse.statusCode).toBe(200);
    expect(scriptResponse.headers['content-type']).toContain('javascript');
    expect(scriptResponse.body).toBe('console.log("miniapp");');
    expect(cssResponse.statusCode).toBe(200);
    expect(cssResponse.headers['content-type']).toContain('text/css');
  });

  it('does not allow asset requests to escape the built assets directory', async () => {
    const app = Fastify();
    registerMiniAppStaticFrontend(app, { rootDir });

    const response = await app.inject({
      method: 'GET',
      url: '/assets/%2e%2e%2Ffrontend%2Findex.html',
    });

    expect(response.statusCode).toBe(404);
  });
});
