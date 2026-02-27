import api from "./api";

export async function createMemoryDraft(payload = {}) {
  const { data } = await api.post("/memories", payload);
  return data;
}

export async function uploadMemoryAudio({ memoryId, file, onProgress }) {
  const form = new FormData();
  form.append("memoryId", memoryId);
  form.append("audio", file);

  const { data } = await api.post("/uploads/audio", form, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: (evt) => {
      if (!evt.total || !onProgress) return;
      onProgress(Math.round((evt.loaded / evt.total) * 100));
    }
  });

  return data;
}

export async function completeUpload(payload) {
  const { data } = await api.post("/uploads/complete", payload);
  return data;
}

export async function getMyMemories() {
  const { data } = await api.get("/memories/me");
  return data;
}

export async function getMemoryById(memoryId) {
  const { data } = await api.get(`/memories/${memoryId}`);
  return data;
}

export async function getPublicFeed() {
  const { data } = await api.get("/memories/public/feed");
  return data;
}

export async function getMemoryChain(memoryId) {
  const { data } = await api.get(`/chain/${memoryId}`);
  return data;
}

export async function setMemoryVisibility(memoryId, isPublic) {
  const { data } = await api.patch(`/memories/${memoryId}/visibility`, { isPublic });
  return data;
}

export async function deleteMemory(memoryId) {
  const { data } = await api.delete(`/memories/${memoryId}`);
  return data;
}

export async function retryTranscription(memoryId) {
  const { data } = await api.post(`/uploads/retry/${memoryId}`, {});
  return data;
}
