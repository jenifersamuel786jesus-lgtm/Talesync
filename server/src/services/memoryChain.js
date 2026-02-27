import Memory from "../models/Memory.js";
import { cosineSimilarity } from "../utils/vector.js";

export async function updateMemoryChain(memoryId) {
  const base = await Memory.findById(memoryId);
  if (!base || !base.embedding?.length) return;

  const candidates = await Memory.find({
    _id: { $ne: base._id },
    status: "completed",
    embedding: { $exists: true, $not: { $size: 0 } }
  })
    .limit(200)
    .lean();

  const related = candidates
    .map((item) => ({ id: item._id, score: cosineSimilarity(base.embedding, item.embedding) }))
    .filter((item) => item.score >= 0.65)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => item.id);

  await Memory.findByIdAndUpdate(memoryId, { relatedMemoryIds: related });

  // Keep links useful across users by backfilling the reverse edge as well.
  await Promise.all(
    related.map(async (candidateId) => {
      const candidate = await Memory.findById(candidateId).select("relatedMemoryIds").lean();
      if (!candidate) return;

      const current = (candidate.relatedMemoryIds || []).map((id) => id.toString());
      const baseId = base._id.toString();
      if (current.includes(baseId)) return;

      const updated = [baseId, ...current].slice(0, 8);
      await Memory.findByIdAndUpdate(candidateId, { relatedMemoryIds: updated });
    })
  );
}
