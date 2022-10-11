import phin from 'phin';

export const getCachedIsValidTwitterProfileImage = () => {
  const cache = new Map<string, boolean>();

  const isValidTwitterProfileImage = async (imageUrl: string): Promise<boolean> => {
    const cachedValue = cache.get(imageUrl);
    if (typeof cachedValue === 'boolean') {
      return cachedValue;
    }

    try {
      const url = new URL(imageUrl);
      const res = await phin({
        url: url.toString()
      });

      const isValid = res.statusCode != null && res.statusCode >= 200 && res.statusCode < 300;
      if (res.statusCode === 429) {
        console.error('Rate limited'); // we shouldn't run into rate limits on this endpoint
        return true;
      }

      cache.set(imageUrl, isValid);
      return isValid;
    } catch (err) {
      cache.set(imageUrl, false);
      return false;
    }
  };

  return isValidTwitterProfileImage;
};

export async function getTwitterProfileImage(
  ids: string[]
): Promise<Record<string, { username: string; name: string; profileImageUrl: string; id: string }>> {
  try {
    const base = 'https://api.twitter.com/2/users';
    const url = new URL(base);
    url.searchParams.append('ids', ids.join(','));
    url.searchParams.append('user.fields', 'profile_image_url');

    const bearer = process.env.TWITTER_BEARER_TOKEN;

    if (!bearer) {
      throw new Error('Missing twitter bearer token');
    }

    const res = await phin({
      url: url.toString(),
      headers: {
        Authorization: `Bearer ${bearer}`
      }
    });
    const body = res.body.toString();

    const json: { data: { username: string; id: string; name: string; profile_image_url: string }[] } =
      JSON.parse(body);

    const result: Record<string, { username: string; name: string; profileImageUrl: string; id: string }> = {};
    for (const response of json?.data ?? []) {
      const id = response.id;
      const profileImageUrl = response.profile_image_url;
      const userId = ids.find((_id) => _id === id);

      if (userId) {
        result[userId] = {
          username: response.username,
          name: response.name,
          profileImageUrl: profileImageUrl,
          id: userId
        };
      }
    }

    return result;
  } catch (err) {
    console.error(err);
    throw err;
  }
}
