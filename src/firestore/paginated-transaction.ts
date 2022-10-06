/**
 * provides boilerplate for performing transactions in a loop
 *
 * Note: there is no good way to handle continuing from the
 * last item in the previous page. Therefore you must provide
 * a query that is terminating. (i.e. the actions performed in
 * transaction should remove items from the query results)
 */
export async function paginatedTransaction<T>(
  query: FirebaseFirestore.Query<T>,
  db: FirebaseFirestore.Firestore,
  options: { pageSize: number; maxPages: number },
  cb: (args: {
    data: FirebaseFirestore.QuerySnapshot<T>;
    txn: FirebaseFirestore.Transaction;
    hasNextPage: boolean;
  }) => Promise<void> | void
) {
  let pagesProcessed = 0;
  let documentsProcessed = 0;
  /**
   * note: attempting to use an internal startAfter set to the last document
   * processed is difficult because the last document processed is expected
   * to be changed within the transaction which could result in skips/repetitions
   * without the requirement of a terminating query
   */
  for (let x = 0; x < options.maxPages; x += 1) {
    const res = await db.runTransaction<Error | { queryEmpty: boolean }>(async (txn) => {
      const pageQuery = query.limit(options.pageSize);
      let items: FirebaseFirestore.QuerySnapshot<T>;
      try {
        items = await txn.get(pageQuery);
      } catch (err) {
        if (err instanceof Error) {
          return err;
        } else if (err && typeof err === 'object' && 'toString' in err && typeof err.toString === 'function') {
          return new Error(err.toString());
        }
        return new Error(`${err}`);
      }
      if (items.empty) {
        return { queryEmpty: true };
      }

      await cb({ data: items, txn, hasNextPage: items.docs.length === options.pageSize });
      documentsProcessed += items.size;

      return { queryEmpty: false };
    });

    if (!('queryEmpty' in res)) {
      throw res;
    }

    pagesProcessed += 1;
    if (res.queryEmpty) {
      return { pagesProcessed, documentsProcessed, queryEmpty: true };
    }
  }

  return { pagesProcessed, documentsProcessed, queryEmpty: false };
}
