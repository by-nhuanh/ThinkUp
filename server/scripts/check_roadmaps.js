import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getMongoDb, closeMongoDb } from '../src/user/db.js';
import { getCareerRoadmapsList, getRoadmapTemplate, reconcileUserRoadmap } from '../src/user/roadmap/roadmap.user.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

try {
  const db = await getMongoDb();
  const careers = await getCareerRoadmapsList();
  const templates = new Map();
  const rows = [];
  for (const career of careers) {
    const template = await getRoadmapTemplate(career.category_id);
    const stored = await db.collection('roadmap_templates').findOne({ category_id: career.category_id });
    const ids = value => (value.stages || []).flatMap(stage => (stage.nodes || []).map(node => node.node_id));
    const apiIds = ids(template);
    const matches = JSON.stringify(apiIds) === JSON.stringify(ids(stored))
      && career.total_nodes === apiIds.length && career.total_stages === template.stages.length;
    if (!matches) throw new Error(`ROADMAP_COUNT_MISMATCH category=${career.category_id}`);
    if (process.argv.includes('--http')) {
      const response = await fetch(`http://127.0.0.1:5000/api/user/roadmap/template/${career.category_id}`);
      if (!response.ok) throw new Error(`HTTP_TEMPLATE_FAILED category=${career.category_id} status=${response.status}`);
      const body = await response.json();
      if (JSON.stringify(ids(body.data)) !== JSON.stringify(apiIds)) {
        throw new Error(`RUNNING_SERVER_OUTDATED category=${career.category_id}`);
      }
    }
    templates.set(career.category_id, template);
    rows.push({ category_id: career.category_id, stages: template.stages.length, nodes: apiIds.length, matches });
  }
  if (!rows.length) throw new Error('No roadmap templates found; verify database configuration.');
  let reconciled = 0;
  let pending = 0;
  let archivedNodes = 0;
  let missingTemplates = 0;
  const roadmaps = await db.collection('user_roadmaps').find().toArray();
  for (const roadmap of roadmaps) {
    const template = templates.get(Number(roadmap.category_id));
    if (!template) { missingTemplates++; continue; }
    const expected = template.stages.flatMap(stage => (stage.nodes || []).map(node => [stage.stage_id, node.node_id]));
    const actual = (roadmap.nodes || []).map(node => [node.stage_id, node.node_id]);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) pending++;
    if (process.argv.includes('--reconcile')) {
      const updated = await reconcileUserRoadmap(roadmap, template, db);
      if (updated !== roadmap) reconciled++;
      archivedNodes += updated.archived_nodes?.length || 0;
    }
  }
  console.log(JSON.stringify({ roadmaps: rows, personal_roadmaps: roadmaps.length,
    pending_before: pending, reconciled, archived_nodes: archivedNodes, missing_templates: missingTemplates }));
  if (missingTemplates || (pending && !process.argv.includes('--reconcile'))) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await closeMongoDb();
}
