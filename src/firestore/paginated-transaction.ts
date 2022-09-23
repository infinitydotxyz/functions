export async function paginatedTransaction<T>(
  query: FirebaseFirestore.Query<T>,
  db: FirebaseFirestore.Firestore,
  options: { pageSize: number; maxPages: number },
  cb: (args: {
    data: FirebaseFirestore.QuerySnapshot<T>;
    txn: FirebaseFirestore.Transaction;
    hasNextPage: boolean;
  }) => Promise<void>
) {
  let pagesProcessed = 0;
  let documentsProcessed = 0;

  for (let x = 0; x < options.maxPages; x += 1) {
    await db.runTransaction(async (txn) => {
      const items = await txn.get(query.limit(options.pageSize));

      if (items.empty) {
        return { pagesProcessed, documentsProcessed, queryEmpty: true };
      }
      await cb({ data: items, txn, hasNextPage: items.docs.length === options.pageSize });
      documentsProcessed += items.size;
    });
    pagesProcessed += 1;
  }

  return { pagesProcessed, documentsProcessed, queryEmpty: false };
}
