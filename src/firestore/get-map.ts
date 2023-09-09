export async function getMap<T = unknown>(
  db: FirebaseFirestore.Firestore,
  map: Map<string, FirebaseFirestore.DocumentReference<T>>
) {
  const result = await db.getAll(
    ...(Array.from(map.values()) as FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>[])
  );
  const resultMap = new Map<string, { ref: FirebaseFirestore.DocumentReference<T>; data: T | null }>();
  for (const [id, ref] of map.entries()) {
    const snapIndex = result.findIndex((item) => item.ref.path === ref.path);
    const snap = result.splice(snapIndex, 1)[0];
    if (!snap) {
      throw new Error(`Failed to find item with id ${id}`);
    }
    resultMap.set(id, {
      ref: snap.ref as FirebaseFirestore.DocumentReference<T>,
      data: (snap.data() ?? null) as T | null
    });
  }

  const get = <U extends T>(id: string): U | null => {
    const item = resultMap.get(id);
    if (!item) {
      throw new Error(`Failed to find item with id ${id}`);
    }
    return item.data as U | null;
  };

  const set = <U extends T>(id: string, data: U): U => {
    const item = resultMap.get(id);
    if (!item) {
      throw new Error(`Invalid set operation. Failed to find item with id ${id}`);
    }
    item.data = data;
    return item.data as U;
  };

  const save = (batch: FirebaseFirestore.WriteBatch) => {
    for (const [, item] of resultMap) {
      console.log(`Saving item - ${item.ref.path}`, item.data);
      batch.set(item.ref, item.data, { merge: true });
    }
  };

  return {
    get,
    set,
    save
  };
}
