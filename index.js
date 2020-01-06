const fetch = require("node-fetch");
const crypto = require("crypto");
const sprintf = require("sprintf-js").sprintf;
const fs = require("fs");
const path = require("path");

function makeDirIfNotExists(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
}

/* from https://github.com/segment-boneyard/hash-mod/blob/master/lib/index.js */
function integerHash(string) {
  return (string + "").split("").reduce((memo, item) => {
    return (memo * 31 * item.charCodeAt(0)) % 982451653;
  }, 7);
}

function makeAssetCachePath(cacheDir, cacheKey) {
  const hash = crypto
    .createHash("sha256")
    .update(cacheKey)
    .digest("hex");

  const quotient = Math.floor(integerHash(hash) / 0x1000);
  const bucket1 = integerHash(hash) % 0x1000;
  const bucket2 = quotient % 0x1000;

  const bucket1HexString = sprintf("%x", bucket1);
  const bucket2HexString = sprintf("%x", bucket2);

  return {
    dir1: bucket1HexString,
    dir2: bucket2HexString,
    dir3: hash.toString(),
    path: path.join(
      cacheDir,
      bucket1HexString,
      bucket2HexString,
      hash.toString()
    )
  };
}

function encodeAssetCacheName(contentType, contentLength) {
  return Buffer.from(`${contentType}:${contentLength}`).toString("base64");
}

function decodeAssetCacheName(encodedString) {
  const decodedFileName = Buffer.from(encodedString, "base64").toString(
    "ascii"
  );
  return decodedFileName.split(":");
}

const middleWare = (module.exports = function(options) {
  return async function(req, res, next) {
    options = options || {};
    options.cacheDir =
      options && options.cacheDir
        ? options.cacheDir
        : path.join(process.cwd(), "/tmp");

    const {
      dir1,
      dir2,
      dir3,
      path: assetCachePath
    } = middleWare.makeAssetCachePath(
      options.cacheDir,
      res.locals.cacheKey || res.locals.fetchUrl
    );

    const startTime = process.hrtime();

    try {
      if (fs.existsSync(assetCachePath)) {
        const firstFile = fs.readdirSync(assetCachePath)[0];

        const [contentType, contentLength] = middleWare.decodeAssetCacheName(
          firstFile
        );

        res.locals.contentLength = contentLength;
        res.locals.contentType = contentType;

        res.locals.buffer = fs.readFileSync(`${assetCachePath}/${firstFile}`);

        const [seconds, nanoSeconds] = process.hrtime(startTime);
        if (options.logger)
          options.logger.info(
            `Read buffer from path ${assetCachePath}/${firstFile} in ${seconds *
              1000 +
              nanoSeconds / 1e6} ms`
          );
      } else {
        // node 10 supports recursive: true, but who knows?
        middleWare.makeDirIfNotExists(options.cacheDir);
        middleWare.makeDirIfNotExists(path.join(options.cacheDir, dir1));
        middleWare.makeDirIfNotExists(path.join(options.cacheDir, dir1, dir2));
        middleWare.makeDirIfNotExists(
          path.join(options.cacheDir, dir1, dir2, dir3)
        );

        const blob = await (await fetch(res.locals.fetchUrl)).blob();

        const fileName = middleWare.encodeAssetCacheName(blob.type, blob.size);

        res.locals.buffer = Buffer.from(await blob.arrayBuffer(), "binary");

        res.locals.contentType = blob.type;
        res.locals.contentLength = blob.size;

        fs.writeFileSync(`${assetCachePath}/${fileName}`, res.locals.buffer);

        const [seconds, nanoSeconds] = process.hrtime(startTime);
        if (options.logger)
          options.logger.info(
            `Wrote buffer to path ${assetCachePath}/${fileName} in ${seconds *
              1000 +
              nanoSeconds / 1e6} ms`
          );
      }

      next();
    } catch (e) {
      console.log(e);
      // in case fs.writeFileSync writes partial data and fails
      if (fs.existsSync(assetCachePath)) {
        fs.unlinkSync(assetCachePath);
      }

      if (options.logger)
        options.logger.error(
          `Caching asset at ${assetCachePath} failed with error: ${e.message}`
        );

      res.status(500).send(e.message);
    }
  };
});

middleWare.makeAssetCachePath = makeAssetCachePath;
middleWare.makeDirIfNotExists = makeDirIfNotExists;
middleWare.encodeAssetCacheName = encodeAssetCacheName;
middleWare.decodeAssetCacheName = decodeAssetCacheName;
