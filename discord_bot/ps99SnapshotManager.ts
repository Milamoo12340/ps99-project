import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

/**
 * PS99 Snapshot Manager — Extended
 * Handles all DB ops for the PS99 mega tracker + Leaksbot
 *
 * Actions:
 *   load               — load snapshot with key "main"
 *   load_keyed         — load snapshot by arbitrary key
 *   save               — save snapshot with key "main"
 *   save_keyed         — save snapshot with arbitrary key
 *   save_finding       — save single finding
 *   batch_save_findings — save multiple findings
 *   get_recent_findings — get findings from last N hours, optional category filter
 *   query_findings     — alias for get_recent_findings (supports limit param)
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const action = body.action;

    // ── load (default key = main) ──────────────────────────────────────
    if (action === 'load') {
      const records = await base44.asServiceRole.entities.PS99Snapshot.filter({ snapshot_key: 'main' });
      if (records?.length > 0) {
        return Response.json({ ok: true, found: true, id: records[0].id, data: records[0].data || {}, updated_at: records[0].updated_at });
      }
      return Response.json({ ok: true, found: false, data: {} });
    }

    // ── load_keyed ────────────────────────────────────────────────────
    if (action === 'load_keyed') {
      const key = body.key || 'main';
      const records = await base44.asServiceRole.entities.PS99Snapshot.filter({ snapshot_key: key });
      if (records?.length > 0) {
        return Response.json({ ok: true, found: true, id: records[0].id, data: records[0].data || {}, updated_at: records[0].updated_at });
      }
      return Response.json({ ok: true, found: false, data: {} });
    }

    // ── save ──────────────────────────────────────────────────────────
    if (action === 'save') {
      const { snapshot_data, record_id } = body;
      const now = new Date().toISOString();
      let saved;
      if (record_id) {
        saved = await base44.asServiceRole.entities.PS99Snapshot.update(record_id, { snapshot_key: 'main', data: snapshot_data, updated_at: now });
      } else {
        const existing = await base44.asServiceRole.entities.PS99Snapshot.filter({ snapshot_key: 'main' });
        if (existing?.length > 0) {
          saved = await base44.asServiceRole.entities.PS99Snapshot.update(existing[0].id, { snapshot_key: 'main', data: snapshot_data, updated_at: now });
        } else {
          saved = await base44.asServiceRole.entities.PS99Snapshot.create({ snapshot_key: 'main', data: snapshot_data, updated_at: now });
        }
      }
      return Response.json({ ok: true, id: saved.id });
    }

    // ── save_keyed ────────────────────────────────────────────────────
    if (action === 'save_keyed') {
      const key = body.key || 'main';
      const { snapshot_data, record_id } = body;
      const now = new Date().toISOString();
      let saved;
      if (record_id) {
        saved = await base44.asServiceRole.entities.PS99Snapshot.update(record_id, { snapshot_key: key, data: snapshot_data, updated_at: now });
      } else {
        const existing = await base44.asServiceRole.entities.PS99Snapshot.filter({ snapshot_key: key });
        if (existing?.length > 0) {
          saved = await base44.asServiceRole.entities.PS99Snapshot.update(existing[0].id, { snapshot_key: key, data: snapshot_data, updated_at: now });
        } else {
          saved = await base44.asServiceRole.entities.PS99Snapshot.create({ snapshot_key: key, data: snapshot_data, updated_at: now });
        }
      }
      return Response.json({ ok: true, id: saved.id });
    }

    // ── save_finding ──────────────────────────────────────────────────
    if (action === 'save_finding') {
      const { category, item_name, change_type, details, thumbnail_url, run_at } = body;
      const saved = await base44.asServiceRole.entities.PS99Finding.create({
        category, item_name, change_type,
        details: details || {},
        thumbnail_url: thumbnail_url || '',
        run_at: run_at || new Date().toISOString(),
        notified: false,
      });
      return Response.json({ ok: true, id: saved.id });
    }

    // ── batch_save_findings ───────────────────────────────────────────
    if (action === 'batch_save_findings') {
      const { findings } = body;
      if (!Array.isArray(findings) || findings.length === 0) return Response.json({ ok: true, saved: 0 });
      let saved = 0;
      for (const f of findings) {
        try {
          await base44.asServiceRole.entities.PS99Finding.create({
            category: f.category || 'Unknown',
            item_name: f.item_name || '?',
            change_type: f.change_type || 'new',
            details: f.details || {},
            thumbnail_url: f.thumbnail_url || '',
            run_at: f.run_at || new Date().toISOString(),
            notified: false,
          });
          saved++;
        } catch (e) {
          console.error('Finding save error:', e.message);
        }
      }
      return Response.json({ ok: true, saved });
    }

    // ── get_recent_findings / query_findings (alias) ──────────────────
    if (action === 'get_recent_findings' || action === 'query_findings') {
      const hours = body.hours || 48;
      const limit = body.limit || 500;
      const category = body.category || null;
      const since = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

      // Fetch findings using filter (more reliable with service role)
      let all = await base44.asServiceRole.entities.PS99Finding.filter({}, { limit: Math.min(limit, 500) }).catch(() => []);
      if (!all || all.length === 0) {
        // Fallback to list
        all = await base44.asServiceRole.entities.PS99Finding.list({ limit: Math.min(limit, 500) }).catch(() => []);
      }

      // Filter by time and optional category
      const filtered = all.filter((f: any) => {
        const runAt = f.run_at || f.created_date || '';
        const timeOk = runAt >= since;
        const catOk = !category || f.category?.toLowerCase() === category.toLowerCase();
        return timeOk && catOk;
      });

      // Apply limit after filtering
      const trimmed = filtered.slice(0, limit);

      return Response.json({ ok: true, findings: trimmed, total: trimmed.length });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400 });

  } catch (error) {
    console.error('ps99SnapshotManager error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
