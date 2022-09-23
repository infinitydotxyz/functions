export async function paginatedTransaction<T>(
  query: FirebaseFirestore.Query<T>,
  db: FirebaseFirestore.Firestore,
  options: { pageSize: number; maxPages: number },
  cb: (args: { data: FirebaseFirestore.QuerySnapshot<T>; txn: FirebaseFirestore.Transaction }) => Promise<void>
) {
  for (let x = 0; x < options.maxPages; x += 1) {
    await db.runTransaction(async (txn) => {
      const items = await txn.get(query.limit(options.pageSize));

      if (items.empty) {
        return;
      }
      await cb({ data: items, txn });
    });
  }
}
