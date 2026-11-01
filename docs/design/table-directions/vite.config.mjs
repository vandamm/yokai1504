import { defineConfig } from 'vite';
import { readFile, writeFile, rename } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const feedback = fileURLToPath(new URL('./feedback.json', import.meta.url));
const choices = ['a', 'b', 'c', 'd'];
const actors = ['mine', 'opponent'];
const scenes = ['main', 'play', 'attack', 'soul', 'trap', 'effect', 'return'];
let writes = Promise.resolve();
async function read() {
  try { return JSON.parse(await readFile(feedback, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return { version: 1, preference: null, comments: [] }; throw error; }
}
const check = (valid, message) => { if (!valid) throw new Error(message); };

export default defineConfig({
  root: fileURLToPath(new URL('../../../', import.meta.url)),
  base: '/',
  server: { host: '127.0.0.1', port: 5178, strictPort: true },
  plugins: [{ name: 'local-design-feedback', configureServer(server) {
    server.middlewares.use('/api/table-directions', async (req, res) => {
      res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
      try {
        if (req.method === 'GET') { res.end(JSON.stringify(await read())); return; }
        check(req.method === 'POST', 'Use GET or POST.');
        check(!req.headers.origin || req.headers.origin === `http://${req.headers.host}`, 'Use the local review page.');
        check(req.headers['content-type']?.startsWith('application/json'), 'Send JSON.');
        req.setEncoding('utf8');
        let body = '';
        for await (const chunk of req) { body += chunk; check(body.length <= 12000, 'Comment is too large.'); }
        const action = JSON.parse(body);
        check(action && ['add', 'delete', 'preference'].includes(action.type), 'Choose a feedback action.');
        if (action.type === 'add') {
          const c = action.comment;
          check(c && choices.includes(c.option) && actors.includes(c.actor) && scenes.includes(c.scene), 'Choose a valid preview.');
          check(typeof c.target === 'string' && /^[a-z0-9:-]{1,80}$/.test(c.target), 'Choose a part of the mockup.');
          check(typeof c.region === 'string' && c.region.length <= 80, 'Choose a region.');
          check(typeof c.note === 'string' && c.note.trim().length > 0 && c.note.length <= 2000, 'Write a comment of up to 2000 characters.');
          check([c.x, c.y].every(n => Number.isFinite(n) && n >= 0 && n <= 1), 'Choose a position on the mockup.');
        } else if (action.type === 'delete') check(typeof action.id === 'string', 'Choose a comment.');
        else check(choices.includes(action.option), 'Choose an option.');
        writes = writes.catch(() => {}).then(async () => {
          const state = await read();
          if (action.type === 'add') {
            check(state.comments.length < 300, 'The review already has 300 comments.');
            const { option, actor, scene, target, region, note, x, y } = action.comment;
            state.comments.push({ id: randomUUID(), option, actor, scene, target, region, note: note.trim(), x, y, createdAt: new Date().toISOString() });
          } else if (action.type === 'delete') state.comments = state.comments.filter(c => c.id !== action.id);
          else state.preference = action.option;
          await writeFile(`${feedback}.tmp`, JSON.stringify(state, null, 2)); await rename(`${feedback}.tmp`, feedback);
          return state;
        });
        res.end(JSON.stringify(await writes));
      } catch (error) { res.statusCode = 400; res.end(JSON.stringify({ error: error.message || 'Feedback could not be saved.' })); }
    });
  } }],
});
