import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { getMongoDb, closeMongoDb } from '../src/user/db.js';
import { ensureSeedQuestions, assessmentTags, inspectStageBank } from '../src/user/roadmap/roadmap.user.js';

dotenv.config({ path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

// Explicit preparation/migration: no learner data, deletion, or generated answers.
export async function prepareRoadmapData() {
  const db = await getMongoDb();
  await ensureSeedQuestions();
  const templates = await db.collection('roadmap_templates').find().toArray();
  let outcomesUpdated = 0;
  let tagsUpdated = 0;
  for (const template of templates) {
    const stages = (template.stages || []).map(stage => ({ ...stage, nodes: (stage.nodes || []).map(node => ({
      ...node,
      outcomes: node.outcomes?.length ? node.outcomes : (node.topics || []),
      assessment_tags: assessmentTags(node, template.career_name || '')
    })) }));
    const result = await db.collection('roadmap_templates').updateOne(
      { _id: template._id, stages: template.stages }, { $set: { stages } }
    );
    if (!result.matchedCount) throw new Error('ROADMAP_TEMPLATE_UPDATE_CONFLICT');
    outcomesUpdated += result.modifiedCount;
    template.stages = stages;
  }
  const definitions = new Map();
  for (const template of templates) {
    for (const stage of template.stages || []) definitions.set(stage.stage_id, { stage, careerName: template.career_name || '' });
  }
  const coll = db.collection('roadmap_stage_questions');
  const records = await coll.find().toArray();
  const updates = [];
  for (const record of records) {
    const definition = definitions.get(record.stage_id);
    const node = definition?.stage.nodes.find(item => item.node_id === record.node_id);
    if (!node) continue;
    const tags = assessmentTags(node, definition.careerName);
    // A missing tag can be recovered only when the node has exactly one skill tag.
    // Career labels are navigation metadata, not assessment skill tags.
    if (!record.skill_tag && tags.length === 1) {
      updates.push({ updateOne: {
        filter: { _id: record._id, $or: [{ skill_tag: { $exists: false } }, { skill_tag: null }, { skill_tag: '' }] },
        update: { $set: { skill_tag: tags[0] } }
      } });
    }
  }
  if (updates.length) tagsUpdated = (await coll.bulkWrite(updates, { ordered: false })).modifiedCount;
  const updatedRecords = await coll.find().toArray();
  const unavailable = [];
  let available = 0;
  for (const { stage, careerName } of definitions.values()) {
    const bank = inspectStageBank(stage, careerName, updatedRecords.filter(q => q.stage_id === stage.stage_id));
    if (bank.available) available++;
    else unavailable.push({ stage_id: stage.stage_id, missing: bank.missing, rejected: bank.rejected });
  }
  return { templates_updated: outcomesUpdated, question_tags_updated: tagsUpdated,
    available_stages: available, unavailable_stages: unavailable.length, unavailable };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const report = await prepareRoadmapData();
    console.log(JSON.stringify(process.argv.includes('--summary')
      ? { ...report, unavailable: report.unavailable.map(item => item.stage_id) } : report));
  } catch {
    console.error('Không thể chuẩn bị dữ liệu Roadmap. Kiểm tra kết nối hoặc thay đổi đồng thời trong CSDL.');
    process.exitCode = 1;
  } finally {
    await closeMongoDb();
  }
}
