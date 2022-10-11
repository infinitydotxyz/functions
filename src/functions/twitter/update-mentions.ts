import { InfinityTweet } from '@infinityxyz/lib/types/services/twitter';
import { firestoreConstants } from '@infinityxyz/lib/utils';
import { differenceInMinutes } from 'date-fns';
import PQueue from 'p-queue';
import FirestoreBatchHandler from '../../firestore/batch-handler';
import { streamQueryWithRef } from '../../firestore/stream-query';
import { addressProgress, nFormatter, partitionArray } from '../../utils';
import { getTwitterProfileImage, getCachedIsValidTwitterProfileImage } from './update-profile-image';

export async function updateMentions(db: FirebaseFirestore.Firestore) {
  const mentionsRef = db.collectionGroup(
    firestoreConstants.COLLECTION_MENTIONS_COLL
  ) as FirebaseFirestore.CollectionGroup<InfinityTweet>;
  const start = Date.now();

  const stream = streamQueryWithRef(mentionsRef, (_, ref) => [ref], { pageSize: 450 });

  const profilesToUpdate = new Map<
    string,
    { refs: FirebaseFirestore.DocumentReference<InfinityTweet>[]; id: string }
  >();

  const isValidTwitterProfileImage = getCachedIsValidTwitterProfileImage();

  console.log(`Getting mentions to check profile images...`);

  const queue = new PQueue({ concurrency: 500 });

  let lastLog = Date.now();
  let completedQuery = false;
  const log = (address: string) => {
    if (address && Date.now() - lastLog > 3000) {
      const time = Date.now();
      const progress = addressProgress(address);
      const _est = ((time - start) / progress) * 100;
      const est = Number.isNaN(_est) || !Number.isFinite(_est) ? 0 : _est;
      const endAt = new Date(time + est);
      lastLog = Date.now();
      const minRemaining = differenceInMinutes(endAt, time);
      console.log(
        `[${progress}%] \tPending: ${nFormatter(queue.pending + queue.size)} \tEST: ${minRemaining} min \tQuery: ${
          completedQuery ? '🟢' : '🔵'
        }`
      );
    }
  };

  const batchHandler = new FirestoreBatchHandler();
  for await (const { data, ref } of stream) {
    queue
      .add(async () => {
        const profileImage = data.author.profileImageUrl;
        let isProfileImageValid = !!profileImage;
        if (profileImage) {
          isProfileImageValid = await isValidTwitterProfileImage(profileImage);
        }

        if (!isProfileImageValid) {
          const updateRequest = profilesToUpdate.get(data.author.id) ?? {
            refs: [] as FirebaseFirestore.DocumentReference<InfinityTweet>[],
            id: data.author.id
          };
          updateRequest.refs.push(ref);
          profilesToUpdate.set(data.author.id, updateRequest);
          if (updateRequest.refs.length === 1) {
            const [, address] = (ref.parent.parent?.id?.split(':') ?? []) as [string, string];
            log(address);
          }
        }
      })
      .catch((err) => {
        console.error(err);
      });
  }

  completedQuery = true;
  await queue.onIdle();

  const batches = partitionArray([...profilesToUpdate.entries()], 100);
  console.log(`Found ${profilesToUpdate.size} profiles to update...`);
  console.log(`Updating ${batches.length} batches...`);

  for (const batch of batches) {
    const ids = batch.map((item) => item[1].id);
    const updates = await getTwitterProfileImage(ids);
    for (const [id, { refs }] of batch) {
      const update = updates[id];
      if (update) {
        console.log(`Updating ${refs.length} mentions for ${id} username ${update.username}...`);
        for (const ref of refs) {
          await batchHandler.addAsync(
            ref,
            { author: { ...update } },
            { mergeFields: ['author.id', 'author.name', 'author.username', 'author.profileImageUrl'] }
          );
        }
      }
    }
  }

  const end = Date.now();
  await batchHandler.flush();
  console.log(`Finished updating mentions in ${end - start}ms`);
}
