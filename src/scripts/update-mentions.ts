import { getDb } from '@/firestore/db';

import { updateMentions } from '../functions/twitter/update-mentions';

async function main() {
  const db = getDb();

  await updateMentions(db);
}

void main();
