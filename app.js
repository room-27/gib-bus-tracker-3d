import express from "express";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

const app = express();
const port = process.env.PORT || 8080;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
console.log(__dirname);

app.use(express.static(join(__dirname, "public")));
app.use("/build/", express.static(join(__dirname, "node_modules/three/build")));
app.use(
  "/jsm/",
  express.static(join(__dirname, "node_modules/three/examples/jsm"))
);

app.get("/", (req, res) => {
  res.render(join(__dirname, "public/index"));
})

app.listen(port);
