import { prepareRoadmapData } from './prepare_roadmap_data.js';
import { closeMongoDb } from '../src/user/db.js';

// Prepare verified stored content; never replace the bank with generic questions.
try {
  console.log(JSON.stringify(await prepareRoadmapData()));
} catch {
  console.error('Không thể chuẩn bị ngân hàng câu hỏi Roadmap.');
  process.exitCode = 1;
} finally {
  await closeMongoDb();
}
