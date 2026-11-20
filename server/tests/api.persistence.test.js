import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createDb } from '../src/db/connection.js';
import { seed } from '../src/db/seed.js';
import { createApp } from '../src/app.js';
import request from 'supertest';
import { idBySlug } from './helpers.js';

describe('persistence across server restarts (file-backed database)', () => {
  it('keeps swipes and matches after the app and database connection are recreated', async () => {
    const file = path.join(os.tmpdir(), `coy-api-persist-${process.pid}.db`);
    const wipe = () => { for (const ext of ['', '-wal', '-shm']) fs.rmSync(file + ext, { force: true }); };
    wipe();
    const quiet = { error() {} };

    // "First server run"
    let db = createDb(file);
    seed(db);
    let app = createApp({ db, logger: quiet });
    const ananya = idBySlug(db, 'ananya');   // liked the user in the seed
    const rohan = idBySlug(db, 'rohan');     // did not
    const tara = idBySlug(db, 'tara');
    expect((await request(app).post('/api/swipe').send({ profileId: ananya, action: 'like' })).body.matched).toBe(true);
    await request(app).post('/api/swipe').send({ profileId: rohan, action: 'like' });
    await request(app).post('/api/swipe').send({ profileId: tara, action: 'pass' });
    db.close();

    // "Server restarted": new connection, re-seed on boot (idempotent), new app
    db = createDb(file);
    seed(db);
    app = createApp({ db, logger: quiet });

    const matches = await request(app).get('/api/matches');
    expect(matches.body.matches.map((m) => m.profile.name)).toEqual(['Ananya']);

    const feed = (await request(app).get('/api/feed?limit=50')).body.profiles.map((p) => p.id);
    for (const id of [ananya, rohan, tara]) expect(feed).not.toContain(id);
    expect(feed).toHaveLength(33 - 3);

    const repeat = await request(app).post('/api/swipe').send({ profileId: ananya, action: 'like' });
    expect(repeat.status).toBe(200);
    expect(repeat.body.alreadySwiped).toBe(true);
    expect(repeat.body.match.id).toBe(matches.body.matches[0].id);
    const conflict = await request(app).post('/api/swipe').send({ profileId: rohan, action: 'pass' });
    expect(conflict.status).toBe(409);

    db.close();
    wipe();
  });
});
