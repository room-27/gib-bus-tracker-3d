import express from "express";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import cors from "cors";
import cors_proxy from "cors-anywhere";

const app = express();
const host = process.env.HOST || "0.0.0.0";
const port = process.env.PORT || 8080;
const proxyPort = (parseInt(process.env.PORT) + 1).toString() || 8081;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log(__dirname);

const allowlist = [process.env.HOST];

const corsOptions = {
  origin: (origin, callback) => {
    if (allowlist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  methods: ["GET"],
  allowedHeaders: ["Content-Type"],
};

cors_proxy.createServer(corsOptions).listen(proxyPort, host, () => {
  console.log("Running CORS Anywhere on port " + proxyPort);
});

app.use(cors());

app.use(express.static(join(__dirname, "public")));
app.use("/build/", express.static(join(__dirname, "node_modules/three/build")));
app.use(
  "/jsm/",
  express.static(join(__dirname, "node_modules/three/examples/jsm"))
);

app.get("/", (req, res) => {
  res.render(join(__dirname, "public/index"));
});

app.listen(port);
