import express from "express";
const app = express();
import { fileURLToPath } from "url";
import { join, dirname } from "path";

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
  res.sendFile(join(__dirname, "public/index.html"));
})

app.listen(8080, () => console.log("http://127.0.0.1:8080"));
