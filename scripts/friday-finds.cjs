const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  AlignmentType, HeadingLevel, BorderStyle, WidthType, ShadingType,
  LevelFormat, ExternalHyperlink, Header, Footer, PageNumber
} = require("docx");
const fs = require("fs");

const BLUE = "1F4E79";
const LIGHT_BLUE = "D6E4F0";
const ACCENT = "2E75B6";
const GOLD = "C7A200";
const LIGHT_GOLD = "FFF8DC";
const GRAY = "F5F5F5";
const BORDER = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const BORDERS = { top: BORDER, bottom: BORDER, left: BORDER, right: BORDER };

function heading(text, level = 1, color = BLUE) {
  return new Paragraph({
    heading: level === 1 ? HeadingLevel.HEADING_1 : HeadingLevel.HEADING_2,
    spacing: { before: level === 1 ? 320 : 200, after: 120 },
    children: [new TextRun({ text, bold: true, color, font: "Arial",
      size: level === 1 ? 28 : 24 })]
  });
}

function para(runs, opts = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 100 },
    alignment: opts.align || AlignmentType.LEFT,
    children: Array.isArray(runs) ? runs : [new TextRun({ text: runs, font: "Arial", size: 22, ...opts })]
  });
}

function bullet(text, bold = false) {
  return new Paragraph({
    numbering: { reference: "bullets", level: 0 },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, font: "Arial", size: 22, bold })]
  });
}

function divider(color = ACCENT) {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color, space: 1 } },
    spacing: { before: 160, after: 160 },
    children: []
  });
}

function infoBox(label, value, labelColor = ACCENT) {
  return new TableRow({
    children: [
      new TableCell({
        borders: BORDERS,
        width: { size: 2500, type: WidthType.DXA },
        shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20, color: labelColor })] })]
      }),
      new TableCell({
        borders: BORDERS,
        width: { size: 6860, type: WidthType.DXA },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: value, font: "Arial", size: 20 })] })]
      })
    ]
  });
}

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [{
          level: 0, format: LevelFormat.BULLET, text: "\u2022", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      },
      {
        reference: "numbers",
        levels: [{
          level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } }
        }]
      }
    ]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: BLUE },
        paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 200, after: 120 }, outlineLevel: 1 } }
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1260, bottom: 1080, left: 1260 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: ACCENT, space: 4 } },
            children: [
              new TextRun({ text: "Fresh Friday Finds", bold: true, font: "Arial", size: 24, color: BLUE }),
              new TextRun({ text: "   |   AI & Innovation Series   |   The Hartford", font: "Arial", size: 20, color: "666666" })
            ]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC", space: 4 } },
            alignment: AlignmentType.CENTER,
            children: [
              new TextRun({ text: "The Hartford | AI Innovation | Confidential Internal Communication", font: "Arial", size: 16, color: "999999" })
            ]
          })
        ]
      })
    },
    children: [

      // ── BANNER TITLE ──────────────────────────────────────────────
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 60 },
        children: [new TextRun({ text: "Fresh Friday Finds", bold: true, font: "Arial", size: 52, color: BLUE })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 60 },
        children: [new TextRun({ text: "From Prompt to Certification: My Journey with the Claude Certified Architect Exam", font: "Arial", size: 28, color: ACCENT, italics: true })]
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 200 },
        children: [new TextRun({ text: "Ranganathan Jayaraman  \u2022  April 4, 2026", font: "Arial", size: 20, color: "666666" })]
      }),

      divider(ACCENT),

      // ── QUICK SNAPSHOT TABLE ─────────────────────────────────────
      new Paragraph({ spacing: { before: 80, after: 80 }, children: [new TextRun({ text: "Quick Snapshot", bold: true, font: "Arial", size: 24, color: BLUE })] }),
      new Table({
        width: { size: 9720, type: WidthType.DXA },
        columnWidths: [2500, 6860],
        rows: [
          infoBox("Exam Launched", "March 12, 2026 \u2014 Anthropic\u2019s first-ever technical certification"),
          infoBox("My Practice Score", "960 / 1000 on Anthropic\u2019s official practice test"),
          infoBox("Exam Access", "Currently exclusive to Anthropic Partner Network (free to join)"),
          infoBox("Our Vendor Partners", "Cognizant & Infosys are official Anthropic Partners \u2014 eligible now"),
          infoBox("Key Takeaway", "AI-powered self-study is real \u2014 no classroom needed"),
        ]
      }),

      divider(ACCENT),

      // ── SECTION 1: THE LAUNCH ────────────────────────────────────
      heading("\uD83D\uDE80  The Day the Exam Dropped", 1),
      para("On March 12, 2026, Anthropic launched the Claude Certified Architect \u2013 Foundations certification \u2014 their very first official technical exam. As someone who has been closely following Claude\u2019s evolution and using it daily, I was genuinely excited. I registered on the same day it was announced."),
      para("For those of us building with AI at The Hartford, this felt significant. This wasn\u2019t just another cloud vendor cert. It covered agentic architecture, MCP server design, Claude Code configuration, prompt engineering, and context management \u2014 exactly the skills that matter for what we\u2019re building."),

      divider(LIGHT_BLUE),

      // ── SECTION 2: STUDY APPROACH ───────────────────────────────
      heading("\uD83E\uDDE0  Preparing in the AI Era: No Classroom Needed", 1),
      para("Here\u2019s the thing about AI certifications in 2026 \u2014 there are no Udemy courses, no Boot.dev paths, no Stack Overflow threads full of exam tips. The certification was brand new. So I did what felt natural: I used AI to prepare for an AI exam."),
      para([
        new TextRun({ text: "Before I started, I wondered how much time and money this prep would take. The answer? ", font: "Arial", size: 22 }),
        new TextRun({ text: "$20.", font: "Arial", size: 22, bold: true, color: GOLD }),
        new TextRun({ text: " That\u2019s the cost of a ", font: "Arial", size: 22 }),
        new TextRun({ text: "Claude Code Pro", font: "Arial", size: 22, bold: true }),
        new TextRun({ text: " subscription \u2014 which I already had on my personal laptop. It became my tutor, my exam coach, and my practice test engine all in one. ", font: "Arial", size: 22 }),
        new TextRun({ text: "$20. One tool. Zero classroom.", font: "Arial", size: 22, bold: true, color: GOLD })
      ]),
      para("Using a series of structured prompts inside Claude Code, I had Claude itself generate:"),
      bullet("Domain-by-domain study guides covering all 5 exam domains"),
      bullet("Concept explanations with real-world architecture scenarios"),
      bullet("Cheat sheets summarizing key rules, APIs, and design patterns"),
      bullet("Targeted Q&A drills on my weak areas after each practice round"),
      para([
        new TextRun({ text: "The Anthropic documentation site provided the high-level domain outlines. But the depth of understanding? ", font: "Arial", size: 22 }),
        new TextRun({ text: "That came from iterating with Claude Code itself.", font: "Arial", size: 22, bold: true }),
        new TextRun({ text: " It\u2019s the first time I\u2019ve genuinely felt that AI is not just a tool for work \u2014 it\u2019s a study partner that meets you exactly where you are.", font: "Arial", size: 22 })
      ]),

      divider(LIGHT_BLUE),

      // ── SECTION 3: THE MCP SERVER ────────────────────────────────
      heading("\u2699\uFE0F  Building a Practice Exam Engine with an MCP Server", 1),
      para("Once the study materials were ready, I faced a new problem: practice exams. Unlike AWS or Azure certifications, there are no third-party practice banks for the Claude Certified Architect exam. So I built one."),
      para("I created a custom MCP (Model Context Protocol) server \u2014 the same technology the exam tests you on \u2014 to simulate the full exam experience:"),

      new Table({
        width: { size: 9720, type: WidthType.DXA },
        columnWidths: [3000, 6720],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 3000, type: WidthType.DXA }, shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Component", bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 6720, type: WidthType.DXA }, shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "What It Does", bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 3000, type: WidthType.DXA }, shading: { fill: GRAY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Question Bank", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 6720, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "180+ questions across all 5 domains, tagged by difficulty (easy/medium/hard)", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 3000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Exam Simulator", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 6720, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "60-question timed exams with real-time scoring, wrong-answer explanations, and domain breakdowns", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 3000, type: WidthType.DXA }, shading: { fill: GRAY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Progress Tracker", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 6720, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "SQLite database tracking scores, weak areas, and improvement over time", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 3000, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Difficulty Filter", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 6720, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Targeted hard-only exam mode to drill weak spots before the real test", font: "Arial", size: 20 })] })] })
          ]}),
        ]
      }),

      para(""),
      para("The MCP server runs locally and plugs directly into Claude Code \u2014 meaning I was practicing through the same interface the exam would test me on. Eating your own dog food, as they say."),

      divider(LIGHT_BLUE),

      // ── SECTION 4: THE RESULT ────────────────────────────────────
      heading("\uD83C\uDFC6  Practice Result: 960 / 1000", 1),
      para("After multiple full 60-question practice runs and targeted domain drills, I took Anthropic\u2019s official practice test provided on their Skilljar platform."),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 160, after: 160 },
        children: [new TextRun({ text: "Score: 960 / 1000", bold: true, font: "Arial", size: 40, color: GOLD })]
      }),
      para("The passing threshold is 720/1000. I felt ready. Confident. I had the cheat sheets memorized, the architecture patterns internalized, and the edge cases drilled. Time for the real exam."),

      divider(LIGHT_BLUE),

      // ── SECTION 5: THE SURPRISE ──────────────────────────────────
      heading("\uD83D\uDE2E  The Surprise: Exclusive to Anthropic Partners", 1),
      para("When I navigated to the real exam on Skilljar, I hit a wall:"),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 120, after: 120 },
        shading: { fill: LIGHT_GOLD, type: ShadingType.CLEAR },
        children: [new TextRun({ text: "\u201CExclusive for Anthropic Partners\u201D", bold: true, font: "Arial", size: 28, color: GOLD, italics: true })]
      }),
      para("The Claude Certified Architect exam is currently gated behind the Anthropic Claude Partner Network. The Hartford, while actively using Anthropic models, is not yet formally enrolled as a Partner."),
      para("The good news? The Partner Network is free to join for any organization actively using Claude. Anthropic has confirmed the exam will open to the public soon. In the meantime, The Hartford can apply directly through Anthropic\u2019s partner enrollment process."),

      divider(LIGHT_BLUE),

      // ── SECTION 6: CALL TO ACTION ─────────────────────────────────
      heading("\uD83D\uDCA1  What This Means for Our Team", 1),
      para("Even without the official exam badge, this journey gave me deep, practical expertise in Claude\u2019s agentic architecture \u2014 knowledge that directly applies to what we\u2019re building at The Hartford."),
      para("Here\u2019s why I strongly encourage our team to pursue this:"),
      bullet("The 13 free Anthropic Academy prep courses on Skilljar are open to everyone \u2014 no partner status needed"),
      bullet("The exam tests real architectural thinking, not just documentation recall"),
      bullet("Agentic AI, MCP servers, and Claude Code are the foundation of where enterprise AI is heading"),
      bullet("The certification will become paid once it opens publicly \u2014 now is the time"),

      new Paragraph({ spacing: { before: 160, after: 80 }, children: [new TextRun({ text: "\uD83D\uDEA8  Our Vendor Partners Can Act Now", bold: true, font: "Arial", size: 24, color: ACCENT })] }),
      para("Both Cognizant and Infosys are official Anthropic Launch Partners. If you work with either vendor, they can facilitate exam access today \u2014 for free \u2014 before it becomes a paid certification."),

      new Table({
        width: { size: 9720, type: WidthType.DXA },
        columnWidths: [2200, 4220, 3300],
        rows: [
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Partner", bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4220, type: WidthType.DXA }, shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Anthropic Relationship", bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 3300, type: WidthType.DXA }, shading: { fill: BLUE, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Exam Access", bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: GRAY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Cognizant", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4220, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Official Launch Partner (350K employees on Claude)", font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 3300, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "\u2705 Available Now (Free)", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Infosys", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4220, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Official Launch Partner (Anthropic Center of Excellence)", font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 3300, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "\u2705 Available Now (Free)", font: "Arial", size: 20 })] })] })
          ]}),
          new TableRow({ children: [
            new TableCell({ borders: BORDERS, width: { size: 2200, type: WidthType.DXA }, shading: { fill: GRAY, type: ShadingType.CLEAR }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "The Hartford", bold: true, font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 4220, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "Active Claude user \u2014 Partner enrollment in progress", font: "Arial", size: 20 })] })] }),
            new TableCell({ borders: BORDERS, width: { size: 3300, type: WidthType.DXA }, margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: "\u23F3 Coming Soon (Free)", font: "Arial", size: 20 })] })] })
          ]})
        ]
      }),

      divider(ACCENT),

      // ── CLOSING ──────────────────────────────────────────────────
      heading("\uD83C\uDF1F  Almost Official Claude Architect", 1),
      para("I may not have the badge (yet), but I came out of this experience with something more valuable: a deep, hands-on understanding of how to design production-grade Claude-powered systems."),
      para([
        new TextRun({ text: "The biggest lesson? ", bold: true, font: "Arial", size: 22 }),
        new TextRun({ text: "In this new world, AI is not just a tool you deploy \u2014 it\u2019s a tool you learn with. Using Claude to prepare for a Claude certification is not cheating. It\u2019s the point.", font: "Arial", size: 22 })
      ]),
      para("If you want to discuss the study approach, get access to the practice MCP server, or talk through what the exam covers \u2014 find me on Teams. Happy to share everything."),

      new Paragraph({ spacing: { before: 200, after: 60 }, children: [new TextRun({ text: "Happy Friday,", font: "Arial", size: 22 })] }),
      new Paragraph({ spacing: { before: 0, after: 60 }, children: [new TextRun({ text: "Ranganathan Jayaraman", bold: true, font: "Arial", size: 22, color: BLUE })] }),
      new Paragraph({ spacing: { before: 0, after: 240 }, children: [new TextRun({ text: "Almost Official Claude Architect  |  The Hartford", font: "Arial", size: 20, color: "666666", italics: true })] }),

      divider("CCCCCC"),

      // ── RESOURCES ─────────────────────────────────────────────────
      heading("Resources & Links", 2),
      bullet("Anthropic Academy (free courses): anthropic.skilljar.com"),
      bullet("Exam access request: anthropic.skilljar.com/claude-certified-architect-foundations-access-request"),
      bullet("Claude Partner Network: anthropic.com/news/claude-partner-network"),
      bullet("Cognizant Anthropic partnership: anthropic.com/news/cognizant-partnership"),
    ]
  }]
});

Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync("C:/Users/meetr/OneDrive/Desktop/FridayFinds_ClaudeCertifiedArchitect.docx", buf);
  console.log("Done! Saved to Desktop.");
}).catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
