import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

export interface StaticFrontendOptions {
  rootDir: string;
}

export function registerMiniAppStaticFrontend(
  app: FastifyInstance,
  options: StaticFrontendOptions,
): void {
  const rootDir = resolve(options.rootDir);
  const assetsDir = resolve(rootDir, 'assets');

  app.addHook('onRequest', async (request, reply) => {
    if (isAssetTraversalRequest(request.url)) {
      reply.code(404).send({ error: 'not_found' });
    }
  });

  app.get('/frontend', async (_request, reply) => {
    reply.redirect('/frontend/');
  });

  app.get('/frontend/', async (_request, reply) => {
    await sendFile(reply, resolve(rootDir, 'frontend', 'index.html'));
  });

  app.get('/frontend/index.html', async (_request, reply) => {
    await sendFile(reply, resolve(rootDir, 'frontend', 'index.html'));
  });

  app.get('/frontend/admin.html', async (_request, reply) => {
    await sendFile(reply, resolve(rootDir, 'frontend', 'admin.html'));
  });

  app.get('/assets/*', async (request, reply) => {
    const requestedAssetPath = readWildcardParam(request);
    const assetPath = resolve(assetsDir, requestedAssetPath);

    if (!isInsideDirectory(assetPath, assetsDir)) {
      reply.code(404).send({ error: 'not_found' });
      return;
    }

    await sendFile(reply, assetPath);
  });
}

function readWildcardParam(request: FastifyRequest): string {
  const params = request.params as { '*': string } | undefined;
  const rawValue = params?.['*'] ?? '';

  try {
    return decodeURIComponent(rawValue);
  } catch {
    return '';
  }
}

function isAssetTraversalRequest(url: string): boolean {
  if (!url.startsWith('/assets/')) {
    return false;
  }

  const pathWithoutQuery = url.split('?', 1)[0] ?? '';
  try {
    return decodeURIComponent(pathWithoutQuery).split('/').includes('..');
  } catch {
    return true;
  }
}

function isInsideDirectory(filePath: string, directory: string): boolean {
  const normalizedDirectory = directory.endsWith(sep) ? directory : `${directory}${sep}`;
  return filePath.startsWith(normalizedDirectory);
}

async function sendFile(reply: FastifyReply, filePath: string): Promise<void> {
  try {
    const body = await readFile(filePath);
    reply.header('content-type', contentTypeFor(filePath)).send(body);
  } catch {
    reply.code(404).send({ error: 'not_found' });
  }
}

function contentTypeFor(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case '.html':
      return 'text/html; charset=utf-8';
    case '.js':
    case '.mjs':
      return 'text/javascript; charset=utf-8';
    case '.css':
      return 'text/css; charset=utf-8';
    case '.svg':
      return 'image/svg+xml';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.woff2':
      return 'font/woff2';
    case '.woff':
      return 'font/woff';
    case '.json':
      return 'application/json; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
