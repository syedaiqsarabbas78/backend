import { readFileSync, writeFileSync } from "node:fs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

const source = new URL("../../docs/project-documentation.md", import.meta.url);
const target = new URL("../../docs/project-documentation.docx", import.meta.url);
const markdown = readFileSync(source, "utf8");

const children = [];
for (const line of markdown.split(/\r?\n/)) {
  if (line.startsWith("## ")) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_1,
        spacing: { before: 280, after: 120 },
        children: [new TextRun(line.slice(3))],
      }),
    );
    continue;
  }
  if (line.startsWith("# ")) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.TITLE,
        spacing: { after: 200 },
        children: [new TextRun(line.slice(2))],
      }),
    );
    continue;
  }
  children.push(
    new Paragraph({
      spacing: { after: 80 },
      children: [new TextRun(line.length > 0 ? line : " ")],
    }),
  );
}

const document = new Document({
  sections: [{ children }],
});

const buffer = await Packer.toBuffer(document);
writeFileSync(target, buffer);
console.log(target.pathname);
