const allowedHosts = [
  "cdninstagram.com",
  "fbcdn.net",
  "tiktokcdn.com",
  "tiktokcdn-us.com",
  "tiktokv.com",
  "muscdn.com",
];

exports.handler = async (event) => {
  const rawUrl = event.queryStringParameters?.url || "";

  let target;
  try {
    target = new URL(rawUrl);
  } catch (error) {
    return { statusCode: 400, body: "Invalid image URL." };
  }

  const isAllowed = allowedHosts.some((host) => target.hostname === host || target.hostname.endsWith(`.${host}`));
  if (!isAllowed) {
    return { statusCode: 403, body: "Image host is not allowed." };
  }

  try {
    const response = await fetch(target.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 ProfilePostsBot/1.0",
        Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      return { statusCode: response.status, body: "Image could not be loaded." };
    }

    const arrayBuffer = await response.arrayBuffer();
    const contentType = response.headers.get("content-type") || "image/jpeg";

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=21600",
      },
      body: Buffer.from(arrayBuffer).toString("base64"),
      isBase64Encoded: true,
    };
  } catch (error) {
    return { statusCode: 502, body: "Image proxy failed." };
  }
};
