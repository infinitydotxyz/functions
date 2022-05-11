interface StreamQueryOptions<DocumentData, TransformedPage = DocumentData, TransformedItem = TransformedPage> {
  pageSize: number;
  transformPage?: (docs: DocumentData[]) => Promise<TransformedPage[]> | TransformedPage[];
  transformItem?: (pageItem?: TransformedPage) => Promise<TransformedItem> | TransformedItem;
}

export async function* streamQuery<DocumentData, TransformedPage = DocumentData, TransformedItem = TransformedPage>(
  query: FirebaseFirestore.Query<DocumentData>,
  getStartAfterField: (
    item: DocumentData,
    ref: FirebaseFirestore.DocumentReference<DocumentData>
  ) => (string | number)[],
  options: StreamQueryOptions<DocumentData, TransformedPage, TransformedItem>
): AsyncGenerator<TransformedItem> {
  let hasNextPage = true;
  let startAfter: (string | number)[] | undefined = undefined;
  while (hasNextPage) {
    let pageQuery = query;
    if (startAfter !== undefined) {
      pageQuery = pageQuery.startAfter(...startAfter);
    }
    const pageSnapshot = await pageQuery.limit(options.pageSize).get();
    const pageData = pageSnapshot.docs.map((item) => item.data());

    const transformedPage: TransformedPage[] = (
      typeof options.transformPage === 'function' ? await options.transformPage(pageData) : pageData
    ) as TransformedPage[];
    for (const item of transformedPage) {
      const transformedItem = (
        options.transformItem && typeof options.transformItem === 'function' ? await options.transformItem(item) : item
      ) as TransformedItem;
      if (transformedItem) {
        yield transformedItem;
      }
    }

    hasNextPage = pageSnapshot.docs.length >= options.pageSize;
    startAfter = getStartAfterField(pageData[pageData.length - 1], pageSnapshot.docs[pageSnapshot.docs.length - 1].ref);
  }
}
