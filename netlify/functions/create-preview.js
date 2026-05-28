const ACTORS = {
  instagram: "apify~instagram-scraper",
  tiktok: "clockworks~tiktok-scraper",
};

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "public, max-age=900",
  },
  body: JSON.stringify(body),
});

const cleanHandle = (value = "") =>
  String(value).trim().replace(/^@+/, "").replace(/\s+/g, "").slice(0, 40);

const compactNumber = (value) => {
  const number = Number(value || 0);
  if (!Number.isFinite(number) || number <= 0) return "";
  if (number >= 1000000) return `${(number / 1000000).toFixed(number >= 10000000 ? 0 : 1)}M`;
  if (number >= 1000) return `${(number / 1000).toFixed(number >= 10000 ? 0 : 1)}K`;
  return String(number);
};

const firstString = (...values) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() || "";

const firstNumber = (...values) =>
  values.find((value) => Number.isFinite(Number(value))) || 0;

const mediaUrlFrom = (item) => {
  if (!item || typeof item !== "object") return "";
  if (Array.isArray(item.images) && item.images[0]) return firstString(item.images[0], item.images[0]?.url);
  if (Array.isArray(item.displayResources) && item.displayResources.length) {
    return firstString(item.displayResources.at(-1)?.src, item.displayResources[0]?.src);
  }
  return firstString(
    item.displayUrl,
    item.thumbnailUrl,
    item.videoCover,
    item.coverUrl,
    item.image,
    item.imageUrl,
    item.authorMeta?.avatar,
    item.ownerProfilePicUrl
  );
};

const postFromInstagram = (item) => ({
  platform: "instagram",
  label: "IG",
  image: mediaUrlFrom(item),
  url: firstString(item.url, item.shortCode ? `https://www.instagram.com/p/${item.shortCode}/` : ""),
  views: compactNumber(firstNumber(item.videoViewCount, item.videoPlayCount, item.views)),
  likes: compactNumber(firstNumber(item.likesCount, item.likes)),
});

const postFromTikTok = (item) => ({
  platform: "tiktok",
  label: "TT",
  image: mediaUrlFrom(item),
  url: firstString(item.webVideoUrl, item.url),
  views: compactNumber(firstNumber(item.playCount, item.play_count, item.stats?.playCount)),
  likes: compactNumber(firstNumber(item.diggCount, item.likes, item.stats?.diggCount)),
});

const profileFrom = (items, handle, platform) => {
  const first = items.find((item) => item && typeof item === "object") || {};
  const author = first.authorMeta || first.owner || {};
  const user = first.user || {};
  const username = firstString(first.ownerUsername, first.username, author.name, user.uniqueId, handle);
  const displayName = firstString(first.fullName, first.ownerFullName, author.nickName, user.nickname, username);
  const avatar = firstString(first.profilePicUrl, first.ownerProfilePicUrl, author.avatar, user.avatarLarger, user.avatarMedium);
  const bio = firstString(first.biography, first.bio, author.signature, user.signature);

  return {
    platform,
    handle: `@${handle}`,
    username,
    displayName,
    avatar,
    bio,
  };
};

const normalizeItems = (items, handle, platform) => {
  const postFactory = platform === "tiktok" ? postFromTikTok : postFromInstagram;
  const posts = items
    .filter((item) => item && typeof item === "object")
    .map(postFactory)
    .filter((post) => post.image || post.url)
    .slice(0, 3);

  return {
    ok: posts.length > 0,
    source: "apify",
    profile: profileFrom(items, handle, platform),
    posts,
  };
};

const actorInput = (platform, handle) => {
  if (platform === "tiktok") {
    return {
      profiles: [handle],
      resultsPerPage: 3,
      maxProfilesPerQuery: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      maxFollowersPerProfile: 0,
      maxFollowingPerProfile: 0,
      commentsPerPost: 0,
      proxyCountryCode: "None",
    };
  }

  return {
    resultsType: "posts",
    directUrls: [`https://www.instagram.com/${handle}/`],
    resultsLimit: 3,
    searchType: "user",
    searchLimit: 1,
    addParentData: true,
  };
};

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Use POST." });
  }

  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return json(500, { ok: false, error: "APIFY_TOKEN is not configured." });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (error) {
    return json(400, { ok: false, error: "Invalid JSON." });
  }

  const platform = payload.platform === "tiktok" ? "tiktok" : "instagram";
  const handle = cleanHandle(payload.handle);
  if (!handle) {
    return json(400, { ok: false, error: "Handle is required." });
  }

  const actor = ACTORS[platform];
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=60`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(actorInput(platform, handle)),
    });

    const text = await response.text();
    let items = [];
    try {
      items = JSON.parse(text);
    } catch (error) {
      throw new Error(`Apify returned non-JSON response (${response.status}).`);
    }

    if (!response.ok) {
      return json(response.status, { ok: false, error: "Apify request failed.", detail: items });
    }

    return json(200, normalizeItems(Array.isArray(items) ? items : [], handle, platform));
  } catch (error) {
    return json(502, { ok: false, error: error.message || "Preview could not be created." });
  }
};
