import { Query, QuerySnap } from './types';

/**
 * provides boilerplate for performing transactions in a loop
 *
 * Note: there is no good way to handle continuing from the
 * last item in the previous page. Therefore you must provide
 * a query that is terminating. (i.e. the actions performed in
 * transaction should remove items from the query results)
 *
 *
 * There are two recommended ways to use this function:
 * 1. provide a query that will eventually be empty
 *   - this can be accomplished by using a query that will
 *     exclude any previously processed items
 * 2. Provide an ordered query where the order of the results
 *   will not change between pages and utilize the applyStartAfter
 *   parameter to continue after the last item in the previous page
 */
export async function paginatedTransaction<T>(
  query: FirebaseFirestore.Query<T>,
  db: FirebaseFirestore.Firestore,
  options: { pageSize: number; maxPages: number },
  cb: (args: {
    data: FirebaseFirestore.QuerySnapshot<T>;
    txn: FirebaseFirestore.Transaction;
    hasNextPage: boolean;
  }) => Promise<void> | void,
  /**
   * note: using startAfter set to the last document processed
   * can be difficult to reason about if the last document is expected
   * to be changed within the transaction. This could result in skips/repetitions
   */
  applyStartAfter?: (
    query: FirebaseFirestore.Query<T>,
    lastPageSnap?: FirebaseFirestore.QuerySnapshot<T>
  ) => FirebaseFirestore.Query<T> | undefined
) {
  let pagesProcessed = 0;
  let documentsProcessed = 0;

  let lastPageSnap: QuerySnap<T>;
  for (let x = 0; x < options.maxPages; x += 1) {
    const res = await db.runTransaction<Error | { queryEmpty: boolean }>(async (txn) => {
      let pageQuery: Query<T> | undefined = query;
      if (applyStartAfter && typeof applyStartAfter === 'function') {
        pageQuery = applyStartAfter(pageQuery, lastPageSnap);
        if (pageQuery == null) {
          return { queryEmpty: true };
        }
      }
      pageQuery = query.limit(options.pageSize);
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
