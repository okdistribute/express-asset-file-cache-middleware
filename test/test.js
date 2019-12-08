const chai = require("chai");
const sinon = require("sinon");
const fs = require("fs");
const fetch = require("node-fetch");
const sinonChai = require("sinon-chai");

const expect = chai.expect;
chai.use(sinonChai);

const middleware = require("../index");

describe("Middleware", function() {
  describe("request handler calling", function() {
    before(function() {
      sinon
        .stub(middleware, "makeDirIfNotExists")
        .withArgs(".")
        .returns(false);
      sinon.stub(fs, "mkdirSync");
      sinon.stub(fetch, "Promise").resolves({
        headers: {
          get: sinon.stub()
        },
        blob: sinon.stub().returns({
          arrayBuffer: sinon.stub().resolves([])
        })
      });
      sinon
        .stub(middleware, "makeAssetCachePath")
        .returns({ dir1: "a1", dir2: "b2", path: "./a1/b2/0123456789abcdef" });

      this.nextSpy = sinon.spy();
    });

    it("writes to the cache if file is not present", async function() {
      const writeSpy = sinon.stub(fs, "writeFileSync");
      sinon
        .stub(fs, "existsSync")
        .withArgs("./a1/b2/0123456789abcdef")
        .returns(false);
      const mw = middleware({ cacheDir: "." });

      await mw(
        {},
        { locals: { cacheKey: "###", fetchUrl: "https://www.example.org" } },
        this.nextSpy
      );

      expect(this.nextSpy).to.have.been.calledOnce;
      expect(writeSpy).to.have.been.calledWith(
        "./a1/b2/0123456789abcdef",
        Buffer.from([])
      );
    });

    it("reads from the file cache if file is present", async function() {
      const readSpy = sinon.stub(fs, "readFileSync").returns(Buffer.from([]));

      sinon
        .stub(fs, "existsSync")
        .withArgs("./a1/b2/0123456789abcdef")
        .returns(true);
      const mw = middleware({ cacheDir: "." });

      await mw(
        {},
        { locals: { cacheKey: "###", fetchUrl: "https://www.example.org" } },
        this.nextSpy
      );

      expect(this.nextSpy).to.have.been.calledOnce;
      expect(readSpy)
        .to.have.been.calledWith("./a1/b2/0123456789abcdef")
        .and.returned(Buffer.from([]));
    });

    // it falls back to a default cache key

    // it falls back to a default cache directory

    afterEach(function() {
      fs.existsSync.restore();
      this.nextSpy.resetHistory();
    });
  });
});
