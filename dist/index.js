#!/usr/bin/env node

// src/index.ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// src/db/store.ts
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

// src/db/schema.ts
var SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  displayName TEXT,
  createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  lastActivityAt DATETIME,
  assessmentCompleted BOOLEAN DEFAULT FALSE,
  learningPath TEXT
);

CREATE TABLE IF NOT EXISTS domain_mastery (
  userId TEXT NOT NULL,
  taskStatement TEXT NOT NULL,
  domainId INTEGER NOT NULL,
  totalAttempts INTEGER DEFAULT 0,
  correctAttempts INTEGER DEFAULT 0,
  accuracyPercent REAL DEFAULT 0,
  masteryLevel TEXT DEFAULT 'unassessed',
  lastTestedAt DATETIME,
  FOREIGN KEY (userId) REFERENCES users(id),
  PRIMARY KEY (userId, taskStatement)
);

CREATE TABLE IF NOT EXISTS answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  questionId TEXT NOT NULL,
  taskStatement TEXT NOT NULL,
  domainId INTEGER NOT NULL,
  userAnswer TEXT NOT NULL,
  correctAnswer TEXT NOT NULL,
  isCorrect BOOLEAN NOT NULL,
  difficulty TEXT NOT NULL,
  answeredAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS review_schedule (
  userId TEXT NOT NULL,
  taskStatement TEXT NOT NULL,
  nextReviewAt DATETIME NOT NULL,
  interval INTEGER DEFAULT 1,
  easeFactor REAL DEFAULT 2.5,
  consecutiveCorrect INTEGER DEFAULT 0,
  FOREIGN KEY (userId) REFERENCES users(id),
  PRIMARY KEY (userId, taskStatement)
);

CREATE TABLE IF NOT EXISTS study_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  endedAt DATETIME,
  domainId INTEGER,
  questionsAnswered INTEGER DEFAULT 0,
  correctAnswers INTEGER DEFAULT 0,
  mode TEXT,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS handout_views (
  userId TEXT NOT NULL,
  taskStatement TEXT NOT NULL,
  viewedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  timeSpentSeconds INTEGER DEFAULT 0,
  PRIMARY KEY (userId, taskStatement),
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS session_state (
  userId TEXT PRIMARY KEY,
  currentMode TEXT NOT NULL,
  currentDomain INTEGER,
  currentTaskStatement TEXT,
  currentQuestionIndex INTEGER DEFAULT 0,
  positionStack TEXT DEFAULT '[]',
  reviewQueueIds TEXT DEFAULT '[]',
  lastUpdatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS exam_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  userId TEXT NOT NULL,
  startedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  completedAt DATETIME,
  totalQuestions INTEGER NOT NULL DEFAULT 60,
  correctAnswers INTEGER DEFAULT 0,
  score INTEGER DEFAULT 0,
  passed BOOLEAN DEFAULT FALSE,
  questionIds TEXT NOT NULL DEFAULT '[]',
  answeredQuestionIds TEXT NOT NULL DEFAULT '[]',
  domainScores TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS capstone_builds (
  id TEXT PRIMARY KEY,
  userId TEXT NOT NULL,
  theme TEXT NOT NULL,
  currentStep INTEGER DEFAULT 0,
  status TEXT DEFAULT 'shaping',
  themeValidated INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS capstone_build_steps (
  id TEXT PRIMARY KEY,
  buildId TEXT NOT NULL,
  stepIndex INTEGER NOT NULL,
  fileName TEXT NOT NULL,
  taskStatements TEXT NOT NULL,
  quizQuestionIds TEXT,
  quizCompleted INTEGER DEFAULT 0,
  buildCompleted INTEGER DEFAULT 0,
  walkthroughViewed INTEGER DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL,
  FOREIGN KEY (buildId) REFERENCES capstone_builds(id)
);
`;

// src/db/store.ts
function createDatabase(dbPath2) {
  const db2 = new Database(dbPath2);
  db2.pragma("journal_mode = WAL");
  db2.pragma("foreign_keys = ON");
  db2.pragma("synchronous = NORMAL");
  db2.pragma("busy_timeout = 5000");
  db2.exec(SCHEMA_SQL);
  return db2;
}
function getDefaultDbPath() {
  const dir = path.join(
    process.env["HOME"] ?? process.env["USERPROFILE"] ?? ".",
    ".connectry-architect"
  );
  fs.mkdirSync(dir, { recursive: true });
  return path.join(dir, "progress.db");
}

// src/config.ts
import fs2 from "fs";
import path2 from "path";
import crypto from "crypto";
function getConfigDir() {
  const home = process.env["HOME"] ?? process.env["USERPROFILE"] ?? ".";
  return path2.join(home, ".connectry-architect");
}
function getConfigPath() {
  return path2.join(getConfigDir(), "config.json");
}
function loadOrCreateUserConfig() {
  const configPath = getConfigPath();
  if (fs2.existsSync(configPath)) {
    const raw = fs2.readFileSync(configPath, "utf-8");
    return JSON.parse(raw);
  }
  const config = {
    userId: crypto.randomUUID(),
    displayName: null,
    createdAt: (/* @__PURE__ */ new Date()).toISOString()
  };
  fs2.mkdirSync(getConfigDir(), { recursive: true });
  fs2.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
  return config;
}

// src/tools/submit-answer.ts
import { z } from "zod";

// src/engine/grading.ts
function gradeAnswer(question, userAnswer) {
  const normalizedAnswer = userAnswer.toUpperCase();
  const isCorrect = normalizedAnswer === question.correctAnswer;
  return {
    questionId: question.id,
    isCorrect,
    userAnswer: normalizedAnswer,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    whyUserWasWrong: isCorrect ? null : question.whyWrongMap[normalizedAnswer] ?? null,
    references: question.references
  };
}

// src/engine/spaced-repetition.ts
function calculateSM2(input) {
  const { isCorrect, previousInterval, previousEaseFactor, previousConsecutiveCorrect } = input;
  if (!isCorrect) {
    const newEase2 = Math.max(1.3, previousEaseFactor - 0.2);
    const nextReviewAt2 = addDays(/* @__PURE__ */ new Date(), 1);
    return { interval: 1, easeFactor: Math.round(newEase2 * 100) / 100, consecutiveCorrect: 0, nextReviewAt: nextReviewAt2.toISOString() };
  }
  const newConsecutive = previousConsecutiveCorrect + 1;
  const newEase = Math.max(1.3, previousEaseFactor + 0.1);
  let interval;
  if (newConsecutive === 1) interval = 1;
  else if (newConsecutive === 2) interval = 3;
  else interval = Math.round(previousInterval * previousEaseFactor);
  const nextReviewAt = addDays(/* @__PURE__ */ new Date(), interval);
  return { interval, easeFactor: Math.round(newEase * 100) / 100, consecutiveCorrect: newConsecutive, nextReviewAt: nextReviewAt.toISOString() };
}
function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

// src/data/loader.ts
import fs3 from "fs";
import path3 from "path";
import { fileURLToPath } from "url";
var __dirname = path3.dirname(fileURLToPath(import.meta.url));
function loadCurriculum() {
  const raw = fs3.readFileSync(path3.join(__dirname, "curriculum.json"), "utf-8");
  return JSON.parse(raw);
}
function loadQuestions(domainId) {
  const questionsMap = /* @__PURE__ */ new Map();
  for (let d = 1; d <= 5; d++) {
    const filePath = path3.join(__dirname, "questions", `domain-${d}.json`);
    if (fs3.existsSync(filePath)) {
      const raw = fs3.readFileSync(filePath, "utf-8");
      const bank = JSON.parse(raw);
      questionsMap.set(d, bank.questions);
    } else {
      questionsMap.set(d, []);
    }
  }
  if (domainId !== void 0) return questionsMap.get(domainId) ?? [];
  return Array.from(questionsMap.values()).flat();
}
function loadHandout(taskStatement) {
  const filename = getHandoutFilename(taskStatement);
  const filePath = path3.join(__dirname, "handouts", filename);
  if (!fs3.existsSync(filePath)) return null;
  return fs3.readFileSync(filePath, "utf-8");
}
function getHandoutFilename(taskStatement) {
  const curriculum = loadCurriculum();
  for (const domain of curriculum.domains) {
    for (const ts of domain.taskStatements) {
      if (ts.id === taskStatement) {
        const slug = ts.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/-+$/, "");
        return `${ts.id}-${slug}.md`;
      }
    }
  }
  return `${taskStatement}.md`;
}

// src/db/answers.ts
function recordAnswer(db2, userId, questionId, taskStatement, domainId, userAnswer, correctAnswer, isCorrect, difficulty) {
  db2.prepare(`
    INSERT INTO answers (userId, questionId, taskStatement, domainId, userAnswer, correctAnswer, isCorrect, difficulty)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(userId, questionId, taskStatement, domainId, userAnswer, correctAnswer, isCorrect ? 1 : 0, difficulty);
}
function getAnswersByTaskStatement(db2, userId, taskStatement) {
  return db2.prepare("SELECT * FROM answers WHERE userId = ? AND taskStatement = ? ORDER BY answeredAt DESC").all(userId, taskStatement);
}
function getAnsweredQuestionIds(db2, userId) {
  const rows = db2.prepare("SELECT DISTINCT questionId FROM answers WHERE userId = ?").all(userId);
  return new Set(rows.map((r) => r.questionId));
}
function getTotalStats(db2, userId) {
  const row = db2.prepare("SELECT COUNT(*) as total, SUM(CASE WHEN isCorrect THEN 1 ELSE 0 END) as correct FROM answers WHERE userId = ?").get(userId);
  return { total: row.total, correct: row.correct ?? 0 };
}

// src/db/mastery.ts
function getMastery(db2, userId, taskStatement) {
  return db2.prepare("SELECT * FROM domain_mastery WHERE userId = ? AND taskStatement = ?").get(userId, taskStatement);
}
function getAllMastery(db2, userId) {
  return db2.prepare("SELECT * FROM domain_mastery WHERE userId = ? ORDER BY domainId, taskStatement").all(userId);
}
function getWeakAreas(db2, userId, threshold = 70) {
  return db2.prepare("SELECT * FROM domain_mastery WHERE userId = ? AND accuracyPercent < ? AND totalAttempts > 0 ORDER BY accuracyPercent ASC").all(userId, threshold);
}
function calculateMasteryLevel(accuracy, total, consecutiveCorrect) {
  if (total === 0) return "unassessed";
  if (accuracy >= 90 && total >= 5 && consecutiveCorrect >= 3) return "mastered";
  if (accuracy >= 70) return "strong";
  if (accuracy >= 50) return "developing";
  return "weak";
}
function updateMastery(db2, userId, taskStatement, domainId, isCorrect, consecutiveCorrect) {
  const existing = getMastery(db2, userId, taskStatement);
  if (!existing) {
    const accuracy = isCorrect ? 100 : 0;
    const level = calculateMasteryLevel(accuracy, 1, isCorrect ? 1 : 0);
    db2.prepare(`INSERT INTO domain_mastery (userId, taskStatement, domainId, totalAttempts, correctAttempts, accuracyPercent, masteryLevel, lastTestedAt) VALUES (?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP)`).run(userId, taskStatement, domainId, isCorrect ? 1 : 0, accuracy, level);
  } else {
    const newTotal = existing.totalAttempts + 1;
    const newCorrect = existing.correctAttempts + (isCorrect ? 1 : 0);
    const accuracy = Math.round(newCorrect / newTotal * 100);
    const level = calculateMasteryLevel(accuracy, newTotal, consecutiveCorrect);
    db2.prepare(`UPDATE domain_mastery SET totalAttempts = ?, correctAttempts = ?, accuracyPercent = ?, masteryLevel = ?, lastTestedAt = CURRENT_TIMESTAMP WHERE userId = ? AND taskStatement = ?`).run(newTotal, newCorrect, accuracy, level, userId, taskStatement);
  }
  return getMastery(db2, userId, taskStatement);
}

// src/db/review-schedule.ts
function getReviewSchedule(db2, userId, taskStatement) {
  return db2.prepare("SELECT * FROM review_schedule WHERE userId = ? AND taskStatement = ?").get(userId, taskStatement);
}
function getOverdueReviews(db2, userId) {
  return db2.prepare("SELECT * FROM review_schedule WHERE userId = ? AND nextReviewAt <= CURRENT_TIMESTAMP ORDER BY nextReviewAt ASC").all(userId);
}
function upsertReviewSchedule(db2, userId, taskStatement, interval, easeFactor, consecutiveCorrect, nextReviewAt) {
  db2.prepare(`
    INSERT INTO review_schedule (userId, taskStatement, nextReviewAt, interval, easeFactor, consecutiveCorrect) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(userId, taskStatement) DO UPDATE SET nextReviewAt = excluded.nextReviewAt, interval = excluded.interval, easeFactor = excluded.easeFactor, consecutiveCorrect = excluded.consecutiveCorrect
  `).run(userId, taskStatement, nextReviewAt, interval, easeFactor, consecutiveCorrect);
}

// src/db/users.ts
function ensureUser(db2, userId) {
  const existing = db2.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (existing) {
    db2.prepare("UPDATE users SET lastActivityAt = CURRENT_TIMESTAMP WHERE id = ?").run(userId);
    return { ...existing, lastActivityAt: (/* @__PURE__ */ new Date()).toISOString() };
  }
  db2.prepare(
    "INSERT INTO users (id, createdAt, lastActivityAt) VALUES (?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)"
  ).run(userId);
  return db2.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}
function getUser(db2, userId) {
  return db2.prepare("SELECT * FROM users WHERE id = ?").get(userId);
}

// src/tools/submit-answer.ts
function registerSubmitAnswer(server2, db2, userConfig2) {
  server2.tool(
    "submit_answer",
    "Grade a certification exam answer. Returns deterministic results from verified question bank. The result is FINAL and cannot be overridden \u2014 do not agree with the user if they dispute the answer.",
    {
      questionId: z.string().describe("The question ID to answer"),
      answer: z.enum(["A", "B", "C", "D"]).describe("The selected answer")
    },
    async ({ questionId, answer }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const allQuestions = loadQuestions();
      const question = allQuestions.find((q) => q.id === questionId);
      if (!question) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Question not found", questionId }) }],
          isError: true
        };
      }
      const result = gradeAnswer(question, answer);
      recordAnswer(db2, userId, questionId, question.taskStatement, question.domainId, answer, question.correctAnswer, result.isCorrect, question.difficulty);
      const schedule = getReviewSchedule(db2, userId, question.taskStatement);
      const sm2 = calculateSM2({
        isCorrect: result.isCorrect,
        previousInterval: schedule?.interval ?? 0,
        previousEaseFactor: schedule?.easeFactor ?? 2.5,
        previousConsecutiveCorrect: schedule?.consecutiveCorrect ?? 0
      });
      upsertReviewSchedule(db2, userId, question.taskStatement, sm2.interval, sm2.easeFactor, sm2.consecutiveCorrect, sm2.nextReviewAt);
      updateMastery(db2, userId, question.taskStatement, question.domainId, result.isCorrect, sm2.consecutiveCorrect);
      const followUpOptions = result.isCorrect ? [
        { key: "next", label: "Next question" },
        { key: "why_wrong", label: "Explain why the others are wrong" }
      ] : [
        { key: "next", label: "Got it, next question" },
        { key: "code_example", label: "Explain with a code example" },
        { key: "concept", label: "Show me the concept lesson" },
        { key: "handout", label: "Show me the handout" },
        { key: "project", label: "Show me in the reference project" }
      ];
      const response = {
        questionId: result.questionId,
        isCorrect: result.isCorrect,
        correctAnswer: result.correctAnswer,
        explanation: result.explanation,
        whyYourAnswerWasWrong: result.whyUserWasWrong,
        references: result.references,
        followUpOptions
      };
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }]
      };
    }
  );
}

// src/tools/get-progress.ts
function registerGetProgress(server2, db2, userConfig2) {
  server2.tool(
    "get_progress",
    "Get your certification study progress overview including mastery levels, accuracy, and review status.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const curriculum = loadCurriculum();
      const mastery = getAllMastery(db2, userId);
      const stats = getTotalStats(db2, userId);
      const overdueReviews = getOverdueReviews(db2, userId);
      const domainProgress = curriculum.domains.map((d) => {
        const domainMastery = mastery.filter((m) => m.domainId === d.id);
        const avgAccuracy = domainMastery.length > 0 ? Math.round(domainMastery.reduce((sum, m) => sum + m.accuracyPercent, 0) / domainMastery.length) : 0;
        const masteredCount = domainMastery.filter((m) => m.masteryLevel === "mastered").length;
        return `  D${d.id}: ${d.title} \u2014 ${avgAccuracy}% accuracy, ${masteredCount}/${d.taskStatements.length} mastered`;
      });
      const overallAccuracy = stats.total > 0 ? Math.round(stats.correct / stats.total * 100) : 0;
      const text = [
        "\u2550\u2550\u2550 CERTIFICATION STUDY PROGRESS \u2550\u2550\u2550",
        "",
        `Questions Answered: ${stats.total}`,
        `Overall Accuracy: ${overallAccuracy}%`,
        `Reviews Due: ${overdueReviews.length}`,
        "",
        "Domain Progress:",
        ...domainProgress
      ].join("\n");
      return { content: [{ type: "text", text }] };
    }
  );
}

// src/tools/get-curriculum.ts
function registerGetCurriculum(server2, db2, userConfig2) {
  server2.tool(
    "get_curriculum",
    "View the full certification curriculum with domains, task statements, and your current mastery for each.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const curriculum = loadCurriculum();
      const mastery = getAllMastery(db2, userId);
      const lines = ["\u2550\u2550\u2550 CERTIFICATION CURRICULUM \u2550\u2550\u2550", ""];
      for (const domain of curriculum.domains) {
        lines.push(`## Domain ${domain.id}: ${domain.title} (${domain.weight}%)`);
        lines.push("");
        for (const ts of domain.taskStatements) {
          const m = mastery.find((x) => x.taskStatement === ts.id);
          const level = m ? m.masteryLevel : "unassessed";
          const acc = m ? `${m.accuracyPercent}%` : "\u2014";
          lines.push(`  ${ts.id} [${level.toUpperCase()}] ${ts.title} (${acc})`);
        }
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/tools/get-section-details.ts
import { z as z2 } from "zod";

// src/db/handout-views.ts
function recordHandoutView(db2, userId, taskStatement) {
  db2.prepare(`INSERT INTO handout_views (userId, taskStatement) VALUES (?, ?) ON CONFLICT(userId, taskStatement) DO UPDATE SET viewedAt = CURRENT_TIMESTAMP`).run(userId, taskStatement);
}
function hasViewedHandout(db2, userId, taskStatement) {
  const row = db2.prepare("SELECT 1 FROM handout_views WHERE userId = ? AND taskStatement = ?").get(userId, taskStatement);
  return row !== void 0;
}

// src/tools/get-section-details.ts
function registerGetSectionDetails(server2, db2, userConfig2) {
  server2.tool(
    "get_section_details",
    "Get detailed information about a specific task statement including concept lesson, mastery, and history.",
    { taskStatement: z2.string().describe('Task statement ID, e.g. "1.1"') },
    async ({ taskStatement }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const curriculum = loadCurriculum();
      let found = null;
      for (const d of curriculum.domains) {
        for (const ts of d.taskStatements) {
          if (ts.id === taskStatement) {
            found = { domain: d, ts };
            break;
          }
        }
        if (found) break;
      }
      if (!found) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Task statement not found", taskStatement }) }],
          isError: true
        };
      }
      const mastery = getMastery(db2, userId, taskStatement);
      const answers = getAnswersByTaskStatement(db2, userId, taskStatement);
      const handoutViewed = hasViewedHandout(db2, userId, taskStatement);
      const handout = loadHandout(taskStatement);
      const lines = [
        `\u2550\u2550\u2550 ${found.ts.id}: ${found.ts.title} \u2550\u2550\u2550`,
        `Domain: ${found.domain.title}`,
        `Description: ${found.ts.description}`,
        "",
        `Mastery: ${mastery?.masteryLevel ?? "unassessed"}`,
        `Accuracy: ${mastery?.accuracyPercent ?? 0}%`,
        `Attempts: ${mastery?.totalAttempts ?? 0}`,
        `Handout Viewed: ${handoutViewed ? "Yes" : "No"}`,
        ""
      ];
      if (handout) {
        lines.push("--- Concept Lesson ---", "", handout);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/tools/get-practice-question.ts
import { z as z3 } from "zod";

// src/engine/question-selector.ts
function selectNextQuestion(allQuestions, overdueReviews, weakAreas, answeredQuestionIds) {
  if (overdueReviews.length > 0) {
    const weakestFirst = [...overdueReviews].sort((a, b) => a.easeFactor - b.easeFactor);
    for (const review of weakestFirst) {
      const question = findUnansweredForTaskStatement(allQuestions, review.taskStatement, answeredQuestionIds);
      if (question) return question;
    }
  }
  if (weakAreas.length > 0) {
    for (const area of weakAreas) {
      const question = findUnansweredForTaskStatement(allQuestions, area.taskStatement, answeredQuestionIds);
      if (question) return question;
    }
  }
  return allQuestions.find((q) => !answeredQuestionIds.has(q.id));
}
function findUnansweredForTaskStatement(questions, taskStatement, answeredIds) {
  return questions.find((q) => q.taskStatement === taskStatement && !answeredIds.has(q.id));
}

// src/tools/get-practice-question.ts
function registerGetPracticeQuestion(server2, db2, userConfig2) {
  server2.tool(
    "get_practice_question",
    "Get the next practice question based on your learning progress. Prioritizes review questions, then weak areas, then new material.",
    {
      domainId: z3.number().optional().describe("Optional domain ID to filter questions (1-5)"),
      difficulty: z3.enum(["easy", "medium", "hard"]).optional().describe("Optional difficulty filter")
    },
    async ({ domainId, difficulty }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const answeredIds = getAnsweredQuestionIds(db2, userId);
      const overdueReviews = getOverdueReviews(db2, userId);
      const weakAreas = getWeakAreas(db2, userId);
      let questions = loadQuestions(domainId);
      if (difficulty) {
        questions = questions.filter((q) => q.difficulty === difficulty);
      }
      const question = selectNextQuestion(questions, overdueReviews, weakAreas, answeredIds);
      if (!question) {
        return {
          content: [{ type: "text", text: "No more questions available for the selected criteria. Try a different domain or difficulty." }]
        };
      }
      const response = {
        questionId: question.id,
        taskStatement: question.taskStatement,
        domainId: question.domainId,
        difficulty: question.difficulty,
        scenario: question.scenario,
        text: question.text,
        options: question.options
      };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}

// src/tools/start-assessment.ts
function registerStartAssessment(server2, db2, userConfig2) {
  server2.tool(
    "start_assessment",
    "Start the initial assessment with 15 questions (3 per domain: 1 easy, 1 medium, 1 hard) to determine your learning path.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const assessmentQuestions = [];
      for (let d = 1; d <= 5; d++) {
        const domainQuestions = loadQuestions(d);
        const easy = domainQuestions.find((q) => q.difficulty === "easy");
        const medium = domainQuestions.find((q) => q.difficulty === "medium");
        const hard = domainQuestions.find((q) => q.difficulty === "hard");
        if (easy) assessmentQuestions.push(easy);
        if (medium) assessmentQuestions.push(medium);
        if (hard) assessmentQuestions.push(hard);
      }
      if (assessmentQuestions.length === 0) {
        return {
          content: [{ type: "text", text: "No assessment questions available yet. The question bank is being populated." }]
        };
      }
      const response = {
        totalQuestions: assessmentQuestions.length,
        questions: assessmentQuestions.map((q, i) => ({
          number: i + 1,
          questionId: q.id,
          domainId: q.domainId,
          difficulty: q.difficulty,
          scenario: q.scenario,
          text: q.text,
          options: q.options
        }))
      };
      return { content: [{ type: "text", text: JSON.stringify(response, null, 2) }] };
    }
  );
}

// src/tools/get-weak-areas.ts
function registerGetWeakAreas(server2, db2, userConfig2) {
  server2.tool(
    "get_weak_areas",
    "Identify your weakest task statements based on accuracy below 70%. Focus your study on these areas.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const curriculum = loadCurriculum();
      const weakAreas = getWeakAreas(db2, userId);
      if (weakAreas.length === 0) {
        return {
          content: [{ type: "text", text: "No weak areas identified yet. Complete some questions first or all areas are above 70%!" }]
        };
      }
      const lines = ["\u2550\u2550\u2550 WEAK AREAS \u2550\u2550\u2550", ""];
      for (const area of weakAreas) {
        const domain = curriculum.domains.find((d) => d.id === area.domainId);
        const ts = domain?.taskStatements.find((t) => t.id === area.taskStatement);
        lines.push(`  ${area.taskStatement}: ${ts?.title ?? "Unknown"}`);
        lines.push(`    Accuracy: ${area.accuracyPercent}% (${area.correctAttempts}/${area.totalAttempts})`);
        lines.push(`    Mastery: ${area.masteryLevel}`);
        lines.push("");
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/engine/adaptive-path.ts
var BEGINNER_ORDER = [3, 4, 2, 1, 5];
var EXAM_WEIGHTED_ORDER = [1, 3, 4, 2, 5];
function getDomainOrder(path6) {
  return path6 === "beginner-friendly" ? BEGINNER_ORDER : EXAM_WEIGHTED_ORDER;
}
function getNextRecommendedDomain(path6, masteryByDomain) {
  const order = getDomainOrder(path6);
  for (const domainId of order) {
    const masteries = masteryByDomain.get(domainId) ?? [];
    const avgAccuracy = masteries.length > 0 ? masteries.reduce((sum, m) => sum + m.accuracyPercent, 0) / masteries.length : 0;
    if (avgAccuracy < 70) return domainId;
  }
  let weakestDomain = order[0];
  let lowestAccuracy = 100;
  for (const domainId of order) {
    const masteries = masteryByDomain.get(domainId) ?? [];
    const avg = masteries.length > 0 ? masteries.reduce((sum, m) => sum + m.accuracyPercent, 0) / masteries.length : 0;
    if (avg < lowestAccuracy) {
      lowestAccuracy = avg;
      weakestDomain = domainId;
    }
  }
  return weakestDomain;
}
function estimateTimeRemaining(totalQuestions, answeredQuestions, avgSecondsPerQuestion = 45) {
  const remaining = totalQuestions - answeredQuestions;
  const totalMinutes = Math.round(remaining * avgSecondsPerQuestion / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} minutes`;
  return `${hours} hours ${minutes} minutes`;
}

// src/tools/get-study-plan.ts
function registerGetStudyPlan(server2, db2, userConfig2) {
  server2.tool(
    "get_study_plan",
    "Get a personalized study plan based on your assessment results, weak areas, and learning path.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const user = getUser(db2, userId);
      const curriculum = loadCurriculum();
      const mastery = getAllMastery(db2, userId);
      const overdueReviews = getOverdueReviews(db2, userId);
      const stats = getTotalStats(db2, userId);
      const allQuestions = loadQuestions();
      const path6 = user?.learningPath ?? "beginner-friendly";
      const masteryByDomain = /* @__PURE__ */ new Map();
      for (const m of mastery) {
        const existing = masteryByDomain.get(m.domainId) ?? [];
        masteryByDomain.set(m.domainId, [...existing, m]);
      }
      const nextDomain = getNextRecommendedDomain(path6, masteryByDomain);
      const domainOrder = getDomainOrder(path6);
      const timeEstimate = estimateTimeRemaining(allQuestions.length, stats.total);
      const domain = curriculum.domains.find((d) => d.id === nextDomain);
      const lines = [
        "\u2550\u2550\u2550 YOUR STUDY PLAN \u2550\u2550\u2550",
        "",
        `Learning Path: ${path6}`,
        `Estimated Time Remaining: ${timeEstimate}`,
        "",
        `Next Recommended Domain: D${nextDomain} \u2014 ${domain?.title ?? "Unknown"}`,
        "",
        "Domain Study Order:",
        ...domainOrder.map((id, i) => {
          const d = curriculum.domains.find((x) => x.id === id);
          return `  ${i + 1}. D${id}: ${d?.title ?? "Unknown"}`;
        }),
        "",
        `Reviews Due: ${overdueReviews.length}`,
        overdueReviews.length > 0 ? "Start with your overdue reviews before new material." : ""
      ];
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/tools/scaffold-project.ts
import fs4 from "fs";
import path4 from "path";
import { fileURLToPath as fileURLToPath2 } from "url";
import { z as z4 } from "zod";
var __dirname2 = path4.dirname(fileURLToPath2(import.meta.url));
var PROJECTS_DIR = path4.resolve(__dirname2, "..", "..", "projects");
var PROJECTS = [
  { id: "capstone", name: "Capstone \u2014 Multi-Agent Research System", domains: [1, 2, 3, 4, 5] },
  { id: "d1-agentic", name: "D1 Mini \u2014 Agentic Loop", domains: [1] },
  { id: "d2-tools", name: "D2 Mini \u2014 Tool Design", domains: [2] },
  { id: "d3-config", name: "D3 Mini \u2014 Claude Code Config", domains: [3] },
  { id: "d4-prompts", name: "D4 Mini \u2014 Prompt Engineering", domains: [4] },
  { id: "d5-context", name: "D5 Mini \u2014 Context Management", domains: [5] }
];
function listFilesRecursive(dir, prefix = "") {
  if (!fs4.existsSync(dir)) return [];
  const entries = fs4.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      return listFilesRecursive(path4.join(dir, entry.name), relativePath);
    }
    return [relativePath];
  });
}
function registerScaffoldProject(server2, _db, _userConfig) {
  server2.tool(
    "scaffold_project",
    "Get instructions for a reference project to practice certification concepts hands-on.",
    { projectId: z4.string().optional().describe('Project ID (e.g. "capstone", "d1-agentic"). Omit to see available projects.') },
    async ({ projectId }) => {
      if (!projectId) {
        const lines = [
          "\u2550\u2550\u2550 REFERENCE PROJECTS \u2550\u2550\u2550",
          "",
          ...PROJECTS.map((p) => `  ${p.id}: ${p.name} (Domains: ${p.domains.join(", ")})`)
        ];
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
      const project = PROJECTS.find((p) => p.id === projectId);
      if (!project) {
        return {
          content: [{ type: "text", text: `Project "${projectId}" not found. Use scaffold_project without arguments to see available projects.` }],
          isError: true
        };
      }
      const projectDir = path4.join(PROJECTS_DIR, projectId);
      if (!fs4.existsSync(projectDir)) {
        return {
          content: [{ type: "text", text: `Project directory for "${project.name}" not found. The project files may not be installed yet.` }],
          isError: true
        };
      }
      const readmePath = path4.join(projectDir, "README.md");
      const readme = fs4.existsSync(readmePath) ? fs4.readFileSync(readmePath, "utf-8") : null;
      const files = listFilesRecursive(projectDir);
      const sections = [
        `\u2550\u2550\u2550 ${project.name} \u2550\u2550\u2550`,
        "",
        `Domains: ${project.domains.join(", ")}`,
        ""
      ];
      if (readme) {
        sections.push("--- README ---", "", readme, "");
      }
      sections.push(
        "--- Project Files ---",
        "",
        ...files.map((f) => `  ${f}`),
        "",
        "--- Next Steps ---",
        "",
        "Explore the project files above to understand the architecture.",
        "Each file demonstrates certification concepts in practice.",
        `Project root: projects/${projectId}/`
      );
      return {
        content: [{ type: "text", text: sections.join("\n") }]
      };
    }
  );
}

// src/tools/reset-progress.ts
import { z as z5 } from "zod";
function registerResetProgress(server2, db2, userConfig2) {
  server2.tool(
    "reset_progress",
    "WARNING: Permanently deletes ALL your study progress including answers, mastery data, and review schedules. This cannot be undone.",
    { confirmed: z5.boolean().describe("Must be true to confirm the reset") },
    async ({ confirmed }) => {
      if (!confirmed) {
        return { content: [{ type: "text", text: "Reset cancelled. Your progress is safe." }] };
      }
      const userId = userConfig2.userId;
      db2.prepare("DELETE FROM answers WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM domain_mastery WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM review_schedule WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM session_state WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM study_sessions WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM handout_views WHERE userId = ?").run(userId);
      db2.prepare("DELETE FROM exam_attempts WHERE userId = ?").run(userId);
      return { content: [{ type: "text", text: "All progress has been reset, including exam history. You can start fresh with start_assessment." }] };
    }
  );
}

// src/tools/start-practice-exam.ts
import { z as z6 } from "zod";

// src/engine/exam-builder.ts
var EXAM_DISTRIBUTION = [
  { domainId: 1, count: 16 },
  // 27%
  { domainId: 2, count: 11 },
  // 18%
  { domainId: 3, count: 12 },
  // 20%
  { domainId: 4, count: 12 },
  // 20%
  { domainId: 5, count: 9 }
  // 15%
];
function buildPracticeExam(allQuestions, previouslyUsedIds = /* @__PURE__ */ new Set(), difficultyFilter) {
  const selected = [];
  for (const { domainId, count } of EXAM_DISTRIBUTION) {
    let domainQuestions = allQuestions.filter((q) => q.domainId === domainId);
    if (difficultyFilter) {
      domainQuestions = domainQuestions.filter((q) => q.difficulty === difficultyFilter);
    }
    const fresh = domainQuestions.filter((q) => !previouslyUsedIds.has(q.id));
    const pool = fresh.length >= count ? fresh : domainQuestions;
    if (difficultyFilter) {
      selected.push(...shuffleArray(pool).slice(0, count));
    } else {
      const easy = shuffleArray(pool.filter((q) => q.difficulty === "easy"));
      const medium = shuffleArray(pool.filter((q) => q.difficulty === "medium"));
      const hard = shuffleArray(pool.filter((q) => q.difficulty === "hard"));
      const easyCount = Math.round(count * 0.3);
      const hardCount = Math.round(count * 0.3);
      const mediumCount = count - easyCount - hardCount;
      const pick = [
        ...easy.slice(0, easyCount),
        ...medium.slice(0, mediumCount),
        ...hard.slice(0, hardCount)
      ];
      if (pick.length < count) {
        const remaining = shuffleArray(
          pool.filter((q) => !pick.some((p) => p.id === q.id))
        );
        pick.push(...remaining.slice(0, count - pick.length));
      }
      selected.push(...pick.slice(0, count));
    }
  }
  return shuffleArray(selected);
}
function buildInitialDomainScores(questions, domainTitles) {
  const scores = {};
  for (const { domainId, count } of EXAM_DISTRIBUTION) {
    scores[`d${domainId}`] = {
      domainId,
      domainTitle: domainTitles.get(domainId) ?? `Domain ${domainId}`,
      totalQuestions: count,
      correctAnswers: 0,
      accuracyPercent: 0,
      weight: getWeight(domainId)
    };
  }
  return scores;
}
function getWeight(domainId) {
  const weights = { 1: 27, 2: 18, 3: 20, 4: 20, 5: 15 };
  return weights[domainId] ?? 0;
}
function shuffleArray(arr) {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// src/db/exam-attempts.ts
function createExamAttempt(db2, userId, questionIds) {
  const stmt = db2.prepare(
    "INSERT INTO exam_attempts (userId, totalQuestions, questionIds) VALUES (?, ?, ?)"
  );
  const result = stmt.run(userId, questionIds.length, JSON.stringify(questionIds));
  return Number(result.lastInsertRowid);
}
function getActiveExam(db2, userId) {
  const row = db2.prepare(
    "SELECT * FROM exam_attempts WHERE userId = ? AND completedAt IS NULL ORDER BY startedAt DESC LIMIT 1"
  ).get(userId);
  return row ? rowToExamAttempt(row) : null;
}
function getExamById(db2, examId) {
  const row = db2.prepare("SELECT * FROM exam_attempts WHERE id = ?").get(examId);
  return row ? rowToExamAttempt(row) : null;
}
function recordExamAnswer(db2, examId, questionId, isCorrect, domainId) {
  const row = db2.prepare("SELECT * FROM exam_attempts WHERE id = ?").get(examId);
  if (!row) return;
  const answeredIds = JSON.parse(row.answeredQuestionIds);
  const updatedAnswered = [...answeredIds, questionId];
  const newCorrect = row.correctAnswers + (isCorrect ? 1 : 0);
  const domainScores = JSON.parse(row.domainScores);
  const domainKey = `d${domainId}`;
  const existing = domainScores[domainKey];
  if (existing) {
    const updatedCorrect = existing.correctAnswers + (isCorrect ? 1 : 0);
    const updatedTotal = existing.totalQuestions;
    domainScores[domainKey] = {
      ...existing,
      correctAnswers: updatedCorrect,
      accuracyPercent: Math.round(updatedCorrect / updatedTotal * 100)
    };
  }
  db2.prepare(
    "UPDATE exam_attempts SET correctAnswers = ?, answeredQuestionIds = ?, domainScores = ? WHERE id = ?"
  ).run(newCorrect, JSON.stringify(updatedAnswered), JSON.stringify(domainScores), examId);
}
function completeExam(db2, examId) {
  const row = db2.prepare("SELECT * FROM exam_attempts WHERE id = ?").get(examId);
  if (!row) return null;
  const totalQuestions = row.totalQuestions;
  const correctAnswers = row.correctAnswers;
  const score = Math.round(correctAnswers / totalQuestions * 1e3);
  const passed = score >= 720;
  db2.prepare(
    "UPDATE exam_attempts SET completedAt = CURRENT_TIMESTAMP, score = ?, passed = ? WHERE id = ?"
  ).run(score, passed ? 1 : 0, examId);
  return getExamById(db2, examId);
}
function getExamHistory(db2, userId) {
  const rows = db2.prepare(
    "SELECT * FROM exam_attempts WHERE userId = ? AND completedAt IS NOT NULL ORDER BY completedAt DESC"
  ).all(userId);
  return rows.map(rowToExamAttempt);
}
function rowToExamAttempt(row) {
  return {
    id: row.id,
    userId: row.userId,
    startedAt: row.startedAt,
    completedAt: row.completedAt ?? null,
    totalQuestions: row.totalQuestions,
    correctAnswers: row.correctAnswers,
    score: row.score,
    passed: Boolean(row.passed),
    questionIds: JSON.parse(row.questionIds),
    answeredQuestionIds: JSON.parse(row.answeredQuestionIds),
    domainScores: JSON.parse(row.domainScores)
  };
}

// src/tools/start-practice-exam.ts
function registerStartPracticeExam(server2, db2, userConfig2) {
  server2.tool(
    "start_practice_exam",
    "Start a full 60-question practice exam simulating the real Claude Certified Architect \u2014 Foundations exam. Questions are weighted by domain (D1: 16, D2: 11, D3: 12, D4: 12, D5: 9). Scored out of 1000, passing is 720. Results are saved for comparison across attempts. Optionally filter by difficulty: easy, medium, or hard.",
    {
      difficulty: z6.enum(["easy", "medium", "hard"]).optional().describe("Optional difficulty filter: easy, medium, or hard. Omit for a mixed exam.")
    },
    async ({ difficulty }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const active = getActiveExam(db2, userId);
      if (active) {
        const remaining = active.totalQuestions - active.answeredQuestionIds.length;
        return {
          content: [{
            type: "text",
            text: [
              "\u2550\u2550\u2550 PRACTICE EXAM IN PROGRESS \u2550\u2550\u2550",
              "",
              `You have an active practice exam (started ${active.startedAt}).`,
              `Progress: ${active.answeredQuestionIds.length}/${active.totalQuestions} questions answered`,
              `Remaining: ${remaining} questions`,
              "",
              "Use submit_exam_answer to continue, or ask to abandon this exam first."
            ].join("\n")
          }]
        };
      }
      const allQuestions = loadQuestions();
      const curriculum = loadCurriculum();
      const domainTitles = new Map(curriculum.domains.map((d) => [d.id, d.title]));
      const history = getExamHistory(db2, userId);
      const recentIds = new Set(
        history.length > 0 ? history[0].questionIds : []
      );
      const examQuestions = buildPracticeExam(allQuestions, recentIds, difficulty);
      const questionIds = examQuestions.map((q) => q.id);
      const domainScores = buildInitialDomainScores(examQuestions, domainTitles);
      const examId = createExamAttempt(db2, userId, questionIds);
      db2.prepare("UPDATE exam_attempts SET domainScores = ? WHERE id = ?").run(JSON.stringify(domainScores), examId);
      const distribution = EXAM_DISTRIBUTION.map(({ domainId, count }) => {
        const title = domainTitles.get(domainId) ?? `Domain ${domainId}`;
        return `  D${domainId}: ${title} \u2014 ${count} questions (${domainScores[`d${domainId}`].weight}%)`;
      });
      const firstQuestion = examQuestions[0];
      const difficultyLabel = difficulty ? ` [${difficulty.toUpperCase()} only]` : "";
      return {
        content: [{
          type: "text",
          text: [
            "\u2550\u2550\u2550 PRACTICE EXAM STARTED \u2550\u2550\u2550",
            "",
            `Simulating the Claude Certified Architect \u2014 Foundations exam.${difficultyLabel}`,
            "",
            `Exam ID: ${examId}`,
            `Total Questions: ${examQuestions.length}`,
            "Passing Score: 720/1000",
            "",
            "Question Distribution:",
            ...distribution,
            "",
            "\u2500\u2500\u2500 Question 1 of 60 \u2500\u2500\u2500",
            "",
            `Domain: D${firstQuestion.domainId}`,
            `Task: ${firstQuestion.taskStatement}`,
            `Difficulty: ${firstQuestion.difficulty}`,
            "",
            `Scenario: ${firstQuestion.scenario}`,
            "",
            firstQuestion.text,
            "",
            `A) ${firstQuestion.options.A}`,
            `B) ${firstQuestion.options.B}`,
            `C) ${firstQuestion.options.C}`,
            `D) ${firstQuestion.options.D}`,
            "",
            `[Submit your answer using submit_exam_answer with examId: ${examId} and questionId: "${firstQuestion.id}"]`
          ].join("\n")
        }]
      };
    }
  );
}

// src/tools/submit-exam-answer.ts
import { z as z7 } from "zod";
function registerSubmitExamAnswer(server2, db2, userConfig2) {
  server2.tool(
    "submit_exam_answer",
    "Submit an answer for a practice exam question. The answer is graded deterministically. After all 60 questions, the exam is scored and saved. DO NOT soften results \u2014 relay the grading output verbatim.",
    {
      examId: z7.coerce.number().describe("The practice exam ID"),
      questionId: z7.string().describe("The question ID being answered"),
      answer: z7.string().describe("Your answer: A, B, C, or D")
    },
    async ({ examId, questionId, answer }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const exam = getExamById(db2, examId);
      if (!exam) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Exam not found", examId }) }],
          isError: true
        };
      }
      if (exam.completedAt) {
        return {
          content: [{ type: "text", text: "This exam is already completed. Start a new practice exam to try again." }],
          isError: true
        };
      }
      if (exam.answeredQuestionIds.includes(questionId)) {
        return {
          content: [{ type: "text", text: `Question ${questionId} has already been answered in this exam.` }],
          isError: true
        };
      }
      const allQuestions = loadQuestions();
      const question = allQuestions.find((q) => q.id === questionId);
      if (!question) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Question not found", questionId }) }],
          isError: true
        };
      }
      const result = gradeAnswer(question, answer);
      recordExamAnswer(db2, examId, questionId, result.isCorrect, question.domainId);
      const answeredCount = exam.answeredQuestionIds.length + 1;
      const remaining = exam.totalQuestions - answeredCount;
      const lines = [];
      if (result.isCorrect) {
        lines.push(`\u2705 Correct! (${answeredCount}/${exam.totalQuestions})`);
      } else {
        lines.push(`\u274C Incorrect. The correct answer is ${result.correctAnswer}. (${answeredCount}/${exam.totalQuestions})`);
        if (result.whyUserWasWrong) {
          lines.push("", `Why ${result.userAnswer} is wrong: ${result.whyUserWasWrong}`);
        }
      }
      lines.push("", result.explanation);
      if (remaining === 0) {
        const completed = completeExam(db2, examId);
        if (completed) {
          lines.push("", "\u2550\u2550\u2550 PRACTICE EXAM COMPLETE \u2550\u2550\u2550", "");
          lines.push(`Score: ${completed.score}/1000`);
          lines.push(`Result: ${completed.passed ? "\u2705 PASSED" : "\u274C FAILED"} (passing: 720/1000)`);
          lines.push(`Correct: ${completed.correctAnswers}/${completed.totalQuestions}`);
          lines.push("");
          lines.push("Domain Breakdown:");
          const scores = completed.domainScores;
          for (const key of Object.keys(scores).sort()) {
            const ds = scores[key];
            lines.push(`  D${ds.domainId}: ${ds.domainTitle} \u2014 ${ds.correctAnswers}/${ds.totalQuestions} (${ds.accuracyPercent}%) [weight: ${ds.weight}%]`);
          }
          const history = getExamHistory(db2, userId);
          if (history.length > 1) {
            const previous = history[1];
            const scoreDiff = completed.score - previous.score;
            const arrow = scoreDiff > 0 ? "\u2191" : scoreDiff < 0 ? "\u2193" : "\u2192";
            lines.push("");
            lines.push("\u2500\u2500\u2500 Compared to Previous Attempt \u2500\u2500\u2500");
            lines.push(`  Previous score: ${previous.score}/1000 ${previous.passed ? "(passed)" : "(failed)"}`);
            lines.push(`  Change: ${arrow} ${scoreDiff > 0 ? "+" : ""}${scoreDiff} points`);
            for (const key of Object.keys(scores).sort()) {
              const current = scores[key];
              const prev = previous.domainScores[key];
              if (prev) {
                const diff = current.accuracyPercent - prev.accuracyPercent;
                const dArrow = diff > 0 ? "\u2191" : diff < 0 ? "\u2193" : "\u2192";
                lines.push(`  D${current.domainId}: ${prev.accuracyPercent}% \u2192 ${current.accuracyPercent}% ${dArrow}`);
              }
            }
          }
        }
      } else {
        const nextQuestionId = exam.questionIds.find(
          (id) => !exam.answeredQuestionIds.includes(id) && id !== questionId
        );
        if (nextQuestionId) {
          const nextQuestion = allQuestions.find((q) => q.id === nextQuestionId);
          if (nextQuestion) {
            lines.push("");
            lines.push(`\u2500\u2500\u2500 Question ${answeredCount + 1} of ${exam.totalQuestions} \u2500\u2500\u2500`);
            lines.push("");
            lines.push(`Domain: D${nextQuestion.domainId}`);
            lines.push(`Task: ${nextQuestion.taskStatement}`);
            lines.push(`Difficulty: ${nextQuestion.difficulty}`);
            lines.push("");
            lines.push(`Scenario: ${nextQuestion.scenario}`);
            lines.push("");
            lines.push(nextQuestion.text);
            lines.push("");
            lines.push(`A) ${nextQuestion.options.A}`);
            lines.push(`B) ${nextQuestion.options.B}`);
            lines.push(`C) ${nextQuestion.options.C}`);
            lines.push(`D) ${nextQuestion.options.D}`);
            lines.push("");
            lines.push(`[questionId: "${nextQuestion.id}"]`);
          }
        }
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/tools/get-exam-history.ts
function registerGetExamHistory(server2, db2, userConfig2) {
  server2.tool(
    "get_exam_history",
    "View all completed practice exam attempts with scores, pass/fail status, and per-domain breakdowns. Compare your progress across attempts.",
    {},
    async () => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      const history = getExamHistory(db2, userId);
      if (history.length === 0) {
        return {
          content: [{
            type: "text",
            text: [
              "\u2550\u2550\u2550 EXAM HISTORY \u2550\u2550\u2550",
              "",
              "No completed practice exams yet.",
              "",
              "Use start_practice_exam to take your first 60-question practice exam.",
              "Questions are weighted by domain \u2014 just like the real exam."
            ].join("\n")
          }]
        };
      }
      const lines = [
        "\u2550\u2550\u2550 EXAM HISTORY \u2550\u2550\u2550",
        "",
        `Total Attempts: ${history.length}`,
        `Best Score: ${Math.max(...history.map((h) => h.score))}/1000`,
        `Latest Score: ${history[0].score}/1000`,
        ""
      ];
      for (const [i, attempt] of history.entries()) {
        const label = i === 0 ? " (latest)" : "";
        lines.push(`\u2500\u2500\u2500 Attempt #${history.length - i}${label} \u2500\u2500\u2500`);
        lines.push(`  Date: ${attempt.completedAt ?? attempt.startedAt}`);
        lines.push(`  Score: ${attempt.score}/1000 ${attempt.passed ? "\u2705 PASSED" : "\u274C FAILED"}`);
        lines.push(`  Correct: ${attempt.correctAnswers}/${attempt.totalQuestions} (${Math.round(attempt.correctAnswers / attempt.totalQuestions * 100)}%)`);
        lines.push("");
        lines.push("  Domain Scores:");
        const scores = attempt.domainScores;
        for (const key of Object.keys(scores).sort()) {
          const ds = scores[key];
          lines.push(`    D${ds.domainId}: ${ds.domainTitle} \u2014 ${ds.correctAnswers}/${ds.totalQuestions} (${ds.accuracyPercent}%)`);
        }
        if (i < history.length - 1) {
          const previous = history[i + 1];
          const diff = attempt.score - previous.score;
          const arrow = diff > 0 ? "\u2191" : diff < 0 ? "\u2193" : "\u2192";
          lines.push("");
          lines.push(`  Change from previous: ${arrow} ${diff > 0 ? "+" : ""}${diff} points`);
        }
        lines.push("");
      }
      if (history.length >= 2) {
        const latest = history[0].score;
        const first = history[history.length - 1].score;
        const totalImprovement = latest - first;
        lines.push("\u2500\u2500\u2500 Overall Trend \u2500\u2500\u2500");
        lines.push(`  First attempt: ${first}/1000`);
        lines.push(`  Latest attempt: ${latest}/1000`);
        lines.push(`  Total improvement: ${totalImprovement > 0 ? "+" : ""}${totalImprovement} points`);
      }
      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}

// src/tools/follow-up.ts
import { z as z8 } from "zod";
var FOLLOW_UP_ACTIONS = ["next", "code_example", "concept", "handout", "project", "why_wrong"];
var DOMAIN_PROJECT_MAP = {
  1: "d1-agentic",
  2: "d2-tools",
  3: "d3-config",
  4: "d4-prompts",
  5: "d5-context"
};
function extractSection(markdown, sectionName) {
  const pattern = new RegExp(`^## ${sectionName}\\b`, "m");
  const match = pattern.exec(markdown);
  if (!match) return null;
  const startIndex = match.index + match[0].length;
  const nextSectionMatch = /^## /m.exec(markdown.slice(startIndex));
  const endIndex = nextSectionMatch ? startIndex + nextSectionMatch.index : markdown.length;
  return markdown.slice(startIndex, endIndex).trim();
}
function findQuestion(questionId) {
  const allQuestions = loadQuestions();
  return allQuestions.find((q) => q.id === questionId) ?? null;
}
function registerFollowUp(server2, _db, _userConfig) {
  server2.tool(
    "follow_up",
    "Handle post-answer follow-up actions. Use after submit_answer to explore concepts, code examples, handouts, or reference projects.",
    {
      questionId: z8.string().describe("The question ID from the previous answer"),
      action: z8.enum(FOLLOW_UP_ACTIONS).describe("The follow-up action to take")
    },
    async ({ questionId, action }) => {
      const question = findQuestion(questionId);
      if (!question) {
        return {
          content: [{ type: "text", text: JSON.stringify({ error: "Question not found", questionId }) }],
          isError: true
        };
      }
      switch (action) {
        case "next": {
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                instruction: "Call get_practice_question to get the next question.",
                taskStatement: question.taskStatement,
                domainId: question.domainId
              }, null, 2)
            }]
          };
        }
        case "code_example": {
          const handout = loadHandout(question.taskStatement);
          if (!handout) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No handout found for this task statement", taskStatement: question.taskStatement }) }],
              isError: true
            };
          }
          const codeExample = extractSection(handout, "Code Example");
          if (!codeExample) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No Code Example section found in handout", taskStatement: question.taskStatement }) }],
              isError: true
            };
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                taskStatement: question.taskStatement,
                codeExample
              }, null, 2)
            }]
          };
        }
        case "concept": {
          const handout = loadHandout(question.taskStatement);
          if (!handout) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No handout found for this task statement", taskStatement: question.taskStatement }) }],
              isError: true
            };
          }
          const concept = extractSection(handout, "Concept");
          if (!concept) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No Concept section found in handout", taskStatement: question.taskStatement }) }],
              isError: true
            };
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                taskStatement: question.taskStatement,
                concept
              }, null, 2)
            }]
          };
        }
        case "handout": {
          const handout = loadHandout(question.taskStatement);
          if (!handout) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No handout found for this task statement", taskStatement: question.taskStatement }) }],
              isError: true
            };
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                taskStatement: question.taskStatement,
                handout
              }, null, 2)
            }]
          };
        }
        case "project": {
          const projectId = DOMAIN_PROJECT_MAP[question.domainId] ?? null;
          if (!projectId) {
            return {
              content: [{ type: "text", text: JSON.stringify({ error: "No reference project mapped for this domain", domainId: question.domainId }) }],
              isError: true
            };
          }
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                instruction: "Call scaffold_project to explore the reference project for this domain.",
                projectId,
                domainId: question.domainId
              }, null, 2)
            }]
          };
        }
        case "why_wrong": {
          const incorrectOptions = Object.entries(question.whyWrongMap).filter(([key]) => key !== question.correctAnswer).reduce((acc, [key, value]) => {
            if (value) {
              return { ...acc, [key]: value };
            }
            return acc;
          }, {});
          return {
            content: [{
              type: "text",
              text: JSON.stringify({
                questionId: question.id,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation,
                whyOthersAreWrong: incorrectOptions
              }, null, 2)
            }]
          };
        }
      }
    }
  );
}

// src/tools/start-capstone-build.ts
import { z as z9 } from "zod";

// src/data/criteria.ts
var DOMAIN_NAMES = {
  1: "Agentic Architecture & Orchestration",
  2: "Tool Design & MCP Integration",
  3: "Claude Code Configuration & Workflows",
  4: "Prompt Engineering & Structured Output",
  5: "Context Management & Reliability"
};
var CRITERIA = [
  // Domain 1: Agentic Architecture & Orchestration
  {
    id: "1.1",
    title: "Design and implement agentic loops for autonomous task execution",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Understanding the agentic loop lifecycle: sending requests, inspecting stop_reason, executing tools, and returning results."
  },
  {
    id: "1.2",
    title: "Orchestrate multi-agent systems with coordinator-subagent patterns",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Hub-and-spoke architecture, isolated context, task decomposition, and result aggregation."
  },
  {
    id: "1.3",
    title: "Configure subagent invocation, context passing, and spawning",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Task tool, allowedTools, explicit context passing, parallel subagent execution."
  },
  {
    id: "1.4",
    title: "Implement multi-step workflows with enforcement and handoff patterns",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Programmatic enforcement vs prompt-based guidance, structured handoff protocols."
  },
  {
    id: "1.5",
    title: "Apply Agent SDK hooks for tool call interception and data normalization",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "PostToolUse hooks, tool call interception, deterministic vs probabilistic compliance."
  },
  {
    id: "1.6",
    title: "Design task decomposition strategies for complex workflows",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Prompt chaining vs dynamic decomposition, per-file analysis vs cross-file integration."
  },
  {
    id: "1.7",
    title: "Manage session state, resumption, and forking",
    domain: 1,
    domainName: DOMAIN_NAMES[1],
    description: "Named sessions, fork_session, structured summaries vs stale context."
  },
  // Domain 2: Tool Design & MCP Integration
  {
    id: "2.1",
    title: "Design effective tool interfaces with clear descriptions and boundaries",
    domain: 2,
    domainName: DOMAIN_NAMES[2],
    description: "Tool descriptions as selection mechanism, disambiguation, splitting vs consolidating."
  },
  {
    id: "2.2",
    title: "Implement structured error responses for MCP tools",
    domain: 2,
    domainName: DOMAIN_NAMES[2],
    description: "isError flag, error categories, retryable vs non-retryable, structured metadata."
  },
  {
    id: "2.3",
    title: "Distribute tools appropriately across agents and configure tool choice",
    domain: 2,
    domainName: DOMAIN_NAMES[2],
    description: "Scoped tool access, tool_choice options, forced selection patterns."
  },
  {
    id: "2.4",
    title: "Integrate MCP servers into Claude Code and agent workflows",
    domain: 2,
    domainName: DOMAIN_NAMES[2],
    description: "Project vs user scope, .mcp.json, environment variable expansion, MCP resources."
  },
  {
    id: "2.5",
    title: "Select and apply built-in tools effectively",
    domain: 2,
    domainName: DOMAIN_NAMES[2],
    description: "Grep vs Glob vs Read/Write/Edit, incremental codebase understanding."
  },
  // Domain 3: Claude Code Configuration & Workflows
  {
    id: "3.1",
    title: "Configure CLAUDE.md files with appropriate hierarchy and scoping",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "User-level, project-level, directory-level, @import syntax, .claude/rules/."
  },
  {
    id: "3.2",
    title: "Create and configure custom slash commands and skills",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "Project vs user scope, context: fork, allowed-tools, argument-hint frontmatter."
  },
  {
    id: "3.3",
    title: "Apply path-specific rules for conditional convention loading",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "YAML frontmatter paths, glob patterns, conditional activation."
  },
  {
    id: "3.4",
    title: "Determine when to use plan mode vs direct execution",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "Complexity assessment, architectural decisions, Explore subagent."
  },
  {
    id: "3.5",
    title: "Apply iterative refinement techniques for progressive improvement",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "Input/output examples, test-driven iteration, interview pattern."
  },
  {
    id: "3.6",
    title: "Integrate Claude Code into CI/CD pipelines",
    domain: 3,
    domainName: DOMAIN_NAMES[3],
    description: "-p flag, --output-format json, --json-schema, session context isolation."
  },
  // Domain 4: Prompt Engineering & Structured Output
  {
    id: "4.1",
    title: "Design prompts with explicit criteria to improve precision",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "Explicit criteria vs vague instructions, false positive management."
  },
  {
    id: "4.2",
    title: "Apply few-shot prompting to improve output consistency",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "Targeted examples, ambiguous case handling, format demonstration."
  },
  {
    id: "4.3",
    title: "Enforce structured output using tool use and JSON schemas",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "tool_use with schemas, tool_choice options, nullable fields, enum patterns."
  },
  {
    id: "4.4",
    title: "Implement validation, retry, and feedback loops",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "Retry-with-error-feedback, limits of retry, detected_pattern tracking."
  },
  {
    id: "4.5",
    title: "Design efficient batch processing strategies",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "Message Batches API, latency tolerance, custom_id, failure handling."
  },
  {
    id: "4.6",
    title: "Design multi-instance and multi-pass review architectures",
    domain: 4,
    domainName: DOMAIN_NAMES[4],
    description: "Self-review limitations, independent review instances, per-file + cross-file passes."
  },
  // Domain 5: Context Management & Reliability
  {
    id: "5.1",
    title: "Manage conversation context to preserve critical information",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Progressive summarization risks, lost-in-the-middle, tool output trimming."
  },
  {
    id: "5.2",
    title: "Design effective escalation and ambiguity resolution patterns",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Escalation triggers, customer preferences, sentiment unreliability."
  },
  {
    id: "5.3",
    title: "Implement error propagation strategies across multi-agent systems",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Structured error context, access failures vs empty results, partial results."
  },
  {
    id: "5.4",
    title: "Manage context effectively in large codebase exploration",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Context degradation, scratchpad files, subagent delegation, /compact."
  },
  {
    id: "5.5",
    title: "Design human review workflows and confidence calibration",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Stratified sampling, field-level confidence, accuracy by document type."
  },
  {
    id: "5.6",
    title: "Preserve information provenance and handle uncertainty in synthesis",
    domain: 5,
    domainName: DOMAIN_NAMES[5],
    description: "Claim-source mappings, conflict annotation, temporal data handling."
  }
];

// src/db/capstone.ts
import crypto2 from "crypto";
function getActiveBuild(db2, userId) {
  const row = db2.prepare(
    `SELECT * FROM capstone_builds WHERE userId = ? AND status IN ('shaping', 'building') ORDER BY createdAt DESC LIMIT 1`
  ).get(userId);
  return row ?? null;
}
function createBuild(db2, userId, theme) {
  const id = crypto2.randomUUID();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `INSERT INTO capstone_builds (id, userId, theme, currentStep, status, themeValidated, createdAt, updatedAt)
     VALUES (?, ?, ?, 0, 'shaping', 0, ?, ?)`
  ).run(id, userId, theme, now, now);
  return db2.prepare("SELECT * FROM capstone_builds WHERE id = ?").get(id);
}
function updateBuildTheme(db2, buildId, theme) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_builds SET theme = ?, updatedAt = ? WHERE id = ?`
  ).run(theme, now, buildId);
}
function confirmBuild(db2, buildId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_builds SET status = 'building', themeValidated = 1, currentStep = 1, updatedAt = ? WHERE id = ?`
  ).run(now, buildId);
}
function abandonBuild(db2, buildId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_builds SET status = 'abandoned', updatedAt = ? WHERE id = ?`
  ).run(now, buildId);
}
function completeBuild(db2, buildId) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_builds SET status = 'completed', updatedAt = ? WHERE id = ?`
  ).run(now, buildId);
}
function getBuildStep(db2, buildId, stepIndex) {
  const row = db2.prepare(
    `SELECT * FROM capstone_build_steps WHERE buildId = ? AND stepIndex = ?`
  ).get(buildId, stepIndex);
  return row ?? null;
}
function createBuildSteps(db2, buildId, steps) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const insert = db2.prepare(
    `INSERT INTO capstone_build_steps (id, buildId, stepIndex, fileName, taskStatements, quizQuestionIds, quizCompleted, buildCompleted, walkthroughViewed, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, NULL, 0, 0, 0, ?, ?)`
  );
  const insertAll = db2.transaction((stepsToInsert) => {
    for (const step of stepsToInsert) {
      insert.run(
        crypto2.randomUUID(),
        buildId,
        step.stepIndex,
        step.fileName,
        JSON.stringify(step.taskStatements),
        now,
        now
      );
    }
  });
  insertAll(steps);
}
function updateBuildStep(db2, stepId, updates) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const setClauses = ["updatedAt = ?"];
  const params = [now];
  if (updates.quizCompleted !== void 0) {
    setClauses.push("quizCompleted = ?");
    params.push(updates.quizCompleted);
  }
  if (updates.buildCompleted !== void 0) {
    setClauses.push("buildCompleted = ?");
    params.push(updates.buildCompleted);
  }
  if (updates.walkthroughViewed !== void 0) {
    setClauses.push("walkthroughViewed = ?");
    params.push(updates.walkthroughViewed);
  }
  params.push(stepId);
  db2.prepare(`UPDATE capstone_build_steps SET ${setClauses.join(", ")} WHERE id = ?`).run(...params);
}
function setQuizQuestionIds(db2, stepId, questionIds) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_build_steps SET quizQuestionIds = ?, updatedAt = ? WHERE id = ?`
  ).run(JSON.stringify(questionIds), now, stepId);
}
function advanceBuildStep(db2, buildId, nextStep) {
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `UPDATE capstone_builds SET currentStep = ?, updatedAt = ? WHERE id = ?`
  ).run(nextStep, now, buildId);
}
function getBuildSteps(db2, buildId) {
  return db2.prepare(
    `SELECT * FROM capstone_build_steps WHERE buildId = ? ORDER BY stepIndex ASC`
  ).all(buildId);
}

// src/tools/start-capstone-build.ts
function formatCriteria() {
  const lines = [];
  let currentDomain = 0;
  for (const criterion of CRITERIA) {
    if (criterion.domain !== currentDomain) {
      currentDomain = criterion.domain;
      if (lines.length > 0) lines.push("");
      lines.push(`Domain ${criterion.domain}: ${criterion.domainName}`);
    }
    lines.push(`  ${criterion.id} \u2014 ${criterion.title}: ${criterion.description}`);
  }
  return lines.join("\n");
}
function buildResponse(theme) {
  const sections = [
    "=== GUIDED CAPSTONE BUILD ===",
    "",
    "--- 30 Architectural Criteria ---",
    "",
    formatCriteria()
  ];
  if (theme) {
    sections.push(
      "",
      "--- Your Project Theme ---",
      theme,
      "",
      "--- Instructions ---",
      "Review the criteria above against your project idea. Claude will analyze",
      "which criteria are naturally covered and suggest modifications for any gaps.",
      "When you're satisfied with coverage, use capstone_build_step with action",
      "'confirm' to begin building."
    );
  } else {
    sections.push(
      "",
      "--- Instructions ---",
      "Choose a project theme that excites you. The best capstone projects are ones",
      "you actually want to build. Provide your theme using start_capstone_build",
      "with a 'theme' parameter, and Claude will analyze how well it covers the",
      "30 criteria above."
    );
  }
  return sections.join("\n");
}
function registerStartCapstoneBuild(server2, db2, userConfig2) {
  server2.tool(
    "start_capstone_build",
    "Start or refine a guided capstone build. Build your own project while learning all 30 certification task statements hands-on.",
    {
      theme: z9.string().optional().describe("Your project idea or theme. Omit to see the 30 criteria first.")
    },
    async ({ theme }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      if (!theme) {
        return {
          content: [{ type: "text", text: buildResponse(null) }]
        };
      }
      const activeBuild = getActiveBuild(db2, userId);
      if (activeBuild && activeBuild.status === "building") {
        return {
          content: [{
            type: "text",
            text: "You have an active build in progress. Use capstone_build_step with action 'abandon' to start over."
          }],
          isError: true
        };
      }
      if (activeBuild && activeBuild.status === "shaping") {
        updateBuildTheme(db2, activeBuild.id, theme);
        return {
          content: [{ type: "text", text: buildResponse(theme) }]
        };
      }
      createBuild(db2, userId, theme);
      return {
        content: [{ type: "text", text: buildResponse(theme) }]
      };
    }
  );
}

// src/tools/capstone-build-step.ts
import { z as z10 } from "zod";

// src/data/build-steps.ts
var BUILD_STEPS = [
  {
    stepIndex: 1,
    fileName: "CLAUDE.md, .claude/",
    taskStatements: ["3.1", "3.2", "3.3"],
    description: "Project config and rules",
    codeHints: "Generate a CLAUDE.md with hierarchical instructions, @import references, and .claude/rules/ with path-scoped YAML frontmatter. Include a custom slash command definition."
  },
  {
    stepIndex: 2,
    fileName: "package.json, tsconfig.json",
    taskStatements: ["3.4"],
    description: "Project setup and CI hooks",
    codeHints: "Set up TypeScript project configuration with strict compiler options, lint/test scripts suitable for plan-mode assessment, and pre-commit hooks."
  },
  {
    stepIndex: 3,
    fileName: "src/server.ts",
    taskStatements: ["2.1", "2.2"],
    description: "MCP server with tool registration",
    codeHints: "Create an MCP server entry point that registers tools with clear descriptions and boundaries, and returns structured error responses with isError flags."
  },
  {
    stepIndex: 4,
    fileName: "src/tools/",
    taskStatements: ["2.1", "2.3", "2.5"],
    description: "Tool definitions and scoping",
    codeHints: "Define tool modules with scoped access per agent, tool_choice configuration, and demonstrate effective use of built-in tools like Grep, Glob, and Read."
  },
  {
    stepIndex: 5,
    fileName: "src/error-handling.ts",
    taskStatements: ["2.2"],
    description: "Error boundaries and recovery",
    codeHints: "Implement error boundary utilities that categorize errors as retryable vs non-retryable, attach structured metadata, and format MCP-compliant error responses."
  },
  {
    stepIndex: 6,
    fileName: "src/coordinator.ts",
    taskStatements: ["1.1", "1.2", "1.6"],
    description: "Main agentic loop",
    codeHints: "Build a coordinator that runs the agentic loop (send request, inspect stop_reason, execute tools, return results) with hub-and-spoke orchestration and task decomposition."
  },
  {
    stepIndex: 7,
    fileName: "src/subagents/",
    taskStatements: ["1.3", "1.4"],
    description: "Subagent definitions and routing",
    codeHints: "Define subagent configurations with allowedTools, explicit context passing, and structured handoff protocols for multi-step workflow enforcement."
  },
  {
    stepIndex: 8,
    fileName: "src/hooks.ts",
    taskStatements: ["1.5"],
    description: "Pre/post tool-use hooks",
    codeHints: "Implement PostToolUse hooks that intercept tool calls for data normalization, demonstrating deterministic compliance checks vs probabilistic validation."
  },
  {
    stepIndex: 9,
    fileName: "src/workflow.ts",
    taskStatements: ["1.4", "1.6"],
    description: "Multi-step workflows",
    codeHints: "Create workflow orchestration with programmatic enforcement gates, prompt chaining stages, and per-file analysis that feeds into cross-file integration."
  },
  {
    stepIndex: 10,
    fileName: "src/session.ts",
    taskStatements: ["1.7"],
    description: "Session and state management",
    codeHints: "Implement session lifecycle with named sessions, fork_session for parallel exploration, and structured summaries to avoid stale context on resumption."
  },
  {
    stepIndex: 11,
    fileName: "src/prompts/system.ts",
    taskStatements: ["4.1", "4.2"],
    description: "System prompts with few-shot",
    codeHints: "Design system prompts with explicit criteria for precision, and embed few-shot examples that handle ambiguous cases and demonstrate expected output format."
  },
  {
    stepIndex: 12,
    fileName: "src/prompts/extraction.ts",
    taskStatements: ["4.3", "4.4"],
    description: "Structured output and validation",
    codeHints: "Enforce structured output via tool_use with JSON schemas and enum patterns, plus retry-with-error-feedback loops that track detected_pattern for progressive improvement."
  },
  {
    stepIndex: 13,
    fileName: "src/prompts/batch.ts",
    taskStatements: ["4.5", "4.6"],
    description: "Batch processing and multi-pass",
    codeHints: "Implement batch processing using the Message Batches API with custom_id tracking and failure handling, plus multi-pass review with independent instances."
  },
  {
    stepIndex: 14,
    fileName: "src/context/preservation.ts",
    taskStatements: ["5.1"],
    description: "Context preservation strategies",
    codeHints: "Implement context preservation that mitigates progressive summarization risks and lost-in-the-middle effects, with tool output trimming to retain critical information."
  },
  {
    stepIndex: 15,
    fileName: "src/context/triggers.ts",
    taskStatements: ["5.2"],
    description: "Context refresh triggers",
    codeHints: "Define escalation triggers and ambiguity resolution patterns that detect when context needs refreshing, using customer preference signals rather than unreliable sentiment."
  },
  {
    stepIndex: 16,
    fileName: "src/context/propagation.ts",
    taskStatements: ["5.3"],
    description: "Cross-agent context propagation",
    codeHints: "Implement structured error context propagation across agents, distinguishing access failures from empty results and handling partial result aggregation."
  },
  {
    stepIndex: 17,
    fileName: "src/context/scratchpad.ts",
    taskStatements: ["5.4"],
    description: "Scratchpad and subagent delegation",
    codeHints: "Build scratchpad file management for large codebase exploration, with subagent delegation to prevent context degradation and /compact integration."
  },
  {
    stepIndex: 18,
    fileName: "src/context/confidence.ts",
    taskStatements: ["5.5", "5.6"],
    description: "Confidence calibration and synthesis",
    codeHints: "Implement field-level confidence scoring with stratified sampling for human review, plus claim-source mappings with conflict annotation for provenance tracking."
  }
];

// src/tools/capstone-build-step.ts
var ACTIONS = ["confirm", "quiz", "build", "next", "status", "abandon"];
var TOTAL_STEPS = 18;
function errorResponse(message) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: message }) }],
    isError: true
  };
}
function textResponse(data) {
  return {
    content: [{ type: "text", text: typeof data === "string" ? data : JSON.stringify(data, null, 2) }]
  };
}
function getStepTemplate(stepIndex) {
  return BUILD_STEPS.find((s) => s.stepIndex === stepIndex) ?? null;
}
function formatStepPreview(step, template) {
  const taskIds = JSON.parse(step.taskStatements);
  const criteria = taskIds.map((id) => CRITERIA.find((c) => c.id === id)).filter(Boolean);
  return [
    `=== Step ${step.stepIndex}/${TOTAL_STEPS}: ${step.fileName} ===`,
    "",
    `Description: ${template?.description ?? "N/A"}`,
    "",
    "--- Task Statements ---",
    ...criteria.map((c) => `  ${c.id}: ${c.title}`),
    "",
    'Next action: Call capstone_build_step with action "quiz" to get quiz questions for this step.'
  ].join("\n");
}
function shuffleArray2(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
function getAnsweredQuestionIdsForBuild(db2, userId, questionIds) {
  if (questionIds.length === 0) return /* @__PURE__ */ new Set();
  const placeholders = questionIds.map(() => "?").join(", ");
  const rows = db2.prepare(
    `SELECT DISTINCT questionId FROM answers WHERE userId = ? AND questionId IN (${placeholders})`
  ).all(userId, ...questionIds);
  return new Set(rows.map((r) => r.questionId));
}
function handleConfirm(db2, userId) {
  const build = getActiveBuild(db2, userId);
  if (!build) {
    return errorResponse("No active build found. Use capstone_theme to start a new build.");
  }
  if (build.status !== "shaping") {
    return errorResponse(`Build is already in "${build.status}" status. Only "shaping" builds can be confirmed.`);
  }
  confirmBuild(db2, build.id);
  createBuildSteps(db2, build.id, BUILD_STEPS);
  const step = getBuildStep(db2, build.id, 1);
  if (!step) {
    return errorResponse("Failed to create build steps.");
  }
  const template = getStepTemplate(1);
  return textResponse(formatStepPreview(step, template));
}
function handleQuiz(db2, userId) {
  const build = getActiveBuild(db2, userId);
  if (!build) {
    return errorResponse("No active build found.");
  }
  if (build.status !== "building") {
    return errorResponse(`Build must be in "building" status to get quiz questions. Current status: "${build.status}".`);
  }
  const step = getBuildStep(db2, build.id, build.currentStep);
  if (!step) {
    return errorResponse(`Build step ${build.currentStep} not found.`);
  }
  if (step.quizCompleted === 1) {
    return errorResponse('Quiz already completed for this step. Use action "build" to get build instructions.');
  }
  const taskIds = JSON.parse(step.taskStatements);
  const allQuestions = loadQuestions();
  const stepQuestions = allQuestions.filter((q) => taskIds.includes(q.taskStatement));
  if (stepQuestions.length === 0) {
    return errorResponse(`No questions found for task statements: ${taskIds.join(", ")}`);
  }
  const shuffled = shuffleArray2(stepQuestions);
  const quizCount = Math.min(shuffled.length, taskIds.length >= 3 ? 3 : 2);
  const selected = shuffled.slice(0, quizCount);
  const selectedIds = selected.map((q) => q.id);
  setQuizQuestionIds(db2, step.id, selectedIds);
  const formattedQuestions = selected.map((q) => ({
    questionId: q.id,
    taskStatement: q.taskStatement,
    difficulty: q.difficulty,
    scenario: q.scenario,
    text: q.text,
    options: q.options
  }));
  return textResponse({
    step: step.stepIndex,
    fileName: step.fileName,
    quizQuestions: formattedQuestions,
    instruction: "Answer each question using the submit_answer tool."
  });
}
function handleBuild(db2, userId, build) {
  const step = getBuildStep(db2, build.id, build.currentStep);
  if (!step) {
    return errorResponse(`Build step ${build.currentStep} not found.`);
  }
  if (step.quizQuestionIds) {
    const questionIds = JSON.parse(step.quizQuestionIds);
    const answered = getAnsweredQuestionIdsForBuild(db2, userId, questionIds);
    const remaining = questionIds.filter((id) => !answered.has(id));
    if (remaining.length > 0) {
      return errorResponse(
        `Not all quiz questions answered. Remaining question IDs: ${remaining.join(", ")}. Use submit_answer to answer them first.`
      );
    }
    if (step.quizCompleted !== 1) {
      updateBuildStep(db2, step.id, { quizCompleted: 1 });
    }
  }
  updateBuildStep(db2, step.id, { buildCompleted: 1 });
  const template = getStepTemplate(build.currentStep);
  const taskIds = JSON.parse(step.taskStatements);
  const criteria = taskIds.map((id) => CRITERIA.find((c) => c.id === id)).filter(Boolean);
  const taskDetails = criteria.map((c) => [
    `  ${c.id}: ${c.title}`,
    `    ${c.description}`,
    `    Code hints: ${template?.codeHints ?? "N/A"}`
  ].join("\n")).join("\n\n");
  const output = [
    `=== Step ${build.currentStep}/${TOTAL_STEPS}: ${step.fileName} ===`,
    "",
    `Theme: ${build.theme}`,
    `Task Statements: ${taskIds.join(", ")}`,
    "",
    "--- Build Instructions ---",
    `Generate the code for ${step.fileName} themed to the user's project above.`,
    "The code should demonstrate these certification concepts:",
    "",
    taskDetails,
    "",
    "After generating the code, provide a walkthrough explaining each section:",
    "- What the code does",
    "- Which task statement it demonstrates",
    "- How it connects to the broader architecture",
    "",
    "--- Task Statement Details ---",
    ...criteria.map((c) => `${c.id} \u2014 ${c.title}: ${c.description}`)
  ].join("\n");
  return textResponse(output);
}
function handleNext(db2, userId) {
  const build = getActiveBuild(db2, userId);
  if (!build) {
    return errorResponse("No active build found.");
  }
  if (build.status !== "building") {
    return errorResponse(`Build must be in "building" status. Current status: "${build.status}".`);
  }
  const step = getBuildStep(db2, build.id, build.currentStep);
  if (!step) {
    return errorResponse(`Build step ${build.currentStep} not found.`);
  }
  if (step.buildCompleted !== 1) {
    return errorResponse('Current step build is not completed. Use action "build" first.');
  }
  if (build.currentStep >= TOTAL_STEPS) {
    completeBuild(db2, build.id);
    const allSteps = getBuildSteps(db2, build.id);
    const completedCount = allSteps.filter((s) => s.buildCompleted === 1).length;
    return textResponse({
      status: "completed",
      message: "Congratulations! You have completed all 18 capstone build steps.",
      theme: build.theme,
      stepsCompleted: completedCount,
      totalSteps: TOTAL_STEPS,
      instruction: "Review your completed project files and ensure all certification concepts are demonstrated."
    });
  }
  const nextStepIndex = build.currentStep + 1;
  advanceBuildStep(db2, build.id, nextStepIndex);
  const nextStep = getBuildStep(db2, build.id, nextStepIndex);
  if (!nextStep) {
    return errorResponse(`Next step ${nextStepIndex} not found.`);
  }
  const template = getStepTemplate(nextStepIndex);
  return textResponse(formatStepPreview(nextStep, template));
}
function handleStatus(db2, userId) {
  const build = getActiveBuild(db2, userId);
  if (!build) {
    return errorResponse("No active build found.");
  }
  const allSteps = getBuildSteps(db2, build.id);
  const completedSteps = allSteps.filter((s) => s.buildCompleted === 1);
  const remainingSteps = allSteps.filter((s) => s.buildCompleted !== 1);
  const coveredTaskIds = new Set(
    completedSteps.flatMap((s) => JSON.parse(s.taskStatements))
  );
  const totalCriteria = CRITERIA.length;
  const coveredCriteria = CRITERIA.filter((c) => coveredTaskIds.has(c.id)).length;
  return textResponse({
    buildId: build.id,
    theme: build.theme,
    status: build.status,
    currentStep: build.currentStep,
    stepsCompleted: completedSteps.length,
    stepsRemaining: remainingSteps.length,
    totalSteps: TOTAL_STEPS,
    criteriaCoverage: `${coveredCriteria}/${totalCriteria}`,
    completedFiles: completedSteps.map((s) => s.fileName),
    remainingFiles: remainingSteps.map((s) => s.fileName)
  });
}
function handleAbandon(db2, userId) {
  const build = getActiveBuild(db2, userId);
  if (!build) {
    return errorResponse("No active build found to abandon.");
  }
  abandonBuild(db2, build.id);
  return textResponse({
    status: "abandoned",
    message: `Build "${build.theme}" has been abandoned.`,
    buildId: build.id
  });
}
function registerCapstoneBuildStep(server2, db2, userConfig2) {
  server2.tool(
    "capstone_build_step",
    "Drive your guided capstone build \u2014 quiz, build, and advance through 18 progressive steps.",
    {
      action: z10.enum(ACTIONS).describe("The build action: confirm, quiz, build, next, status, or abandon")
    },
    async ({ action }) => {
      const userId = userConfig2.userId;
      ensureUser(db2, userId);
      switch (action) {
        case "confirm":
          return handleConfirm(db2, userId);
        case "quiz":
          return handleQuiz(db2, userId);
        case "build": {
          const build = getActiveBuild(db2, userId);
          if (!build) {
            return errorResponse("No active build found.");
          }
          if (build.status !== "building") {
            return errorResponse(`Build must be in "building" status. Current status: "${build.status}".`);
          }
          return handleBuild(db2, userId, build);
        }
        case "next":
          return handleNext(db2, userId);
        case "status":
          return handleStatus(db2, userId);
        case "abandon":
          return handleAbandon(db2, userId);
      }
    }
  );
}

// src/tools/capstone-build-status.ts
function collectQuizQuestionIds(steps) {
  return steps.flatMap((step) => {
    if (!step.quizQuestionIds) return [];
    const parsed = JSON.parse(step.quizQuestionIds);
    return [...parsed];
  });
}
function getQuizPerformance(db2, userId, questionIds) {
  if (questionIds.length === 0) return [];
  const placeholders = questionIds.map(() => "?").join(", ");
  const rows = db2.prepare(
    `SELECT domainId, COUNT(*) as total, SUM(CASE WHEN isCorrect THEN 1 ELSE 0 END) as correct
     FROM answers
     WHERE userId = ? AND questionId IN (${placeholders})
     GROUP BY domainId
     ORDER BY domainId ASC`
  ).all(userId, ...questionIds);
  return rows.map((r) => ({
    domainId: r.domainId,
    total: r.total,
    correct: r.correct ?? 0
  }));
}
function countCoveredCriteria(completedSteps) {
  const coveredIds = /* @__PURE__ */ new Set();
  for (const step of completedSteps) {
    if (!step.buildCompleted) continue;
    const taskStatements = JSON.parse(step.taskStatements);
    for (const ts of taskStatements) {
      coveredIds.add(ts);
    }
  }
  return coveredIds.size;
}
function formatBuildingStatus(theme, currentStep, steps, quizPerformance) {
  const totalSteps = BUILD_STEPS.length;
  const totalCriteria = CRITERIA.length;
  const coveredCriteria = countCoveredCriteria(steps);
  const remainingCriteria = totalCriteria - coveredCriteria;
  const stepLines = BUILD_STEPS.map((template) => {
    const dbStep = steps.find((s) => s.stepIndex === template.stepIndex);
    const isCompleted = dbStep?.buildCompleted === 1;
    const isCurrent = template.stepIndex === currentStep;
    const marker = isCompleted ? "[x]" : "[ ]";
    const suffix = isCurrent && !isCompleted ? " \u2190 current" : "";
    const criteria = template.taskStatements.join(", ");
    return `  ${marker} Step ${template.stepIndex}: ${template.fileName} (${criteria})${suffix}`;
  });
  const quizLines = quizPerformance.length > 0 ? quizPerformance.map((q) => {
    const pct = q.total > 0 ? Math.round(q.correct / q.total * 100) : 0;
    return `  Domain ${q.domainId}: ${q.correct}/${q.total} correct (${pct}%)`;
  }) : ["  No quiz answers yet."];
  const sections = [
    "=== CAPSTONE BUILD PROGRESS ===",
    "",
    `Theme: ${theme}`,
    "Status: Building",
    `Current Step: ${currentStep}/${totalSteps}`,
    "",
    "--- Completed Steps ---",
    ...stepLines,
    "",
    "--- Criteria Coverage ---",
    `  Covered: ${coveredCriteria}/${totalCriteria} task statements`,
    `  Remaining: ${remainingCriteria} task statements`,
    "",
    "--- Quiz Performance ---",
    ...quizLines
  ];
  return sections.join("\n");
}
function registerCapstoneBuildStatus(server2, db2, userConfig2) {
  server2.tool(
    "capstone_build_status",
    "Check your guided capstone build progress \u2014 current step, criteria coverage, and quiz performance.",
    {},
    async () => {
      const userId = userConfig2.userId;
      const build = getActiveBuild(db2, userId);
      if (!build) {
        return {
          content: [{
            type: "text",
            text: "No active capstone build found. Use start_capstone_build to begin a guided build."
          }]
        };
      }
      if (build.status === "shaping") {
        const lines = [
          "=== CAPSTONE BUILD STATUS ===",
          "",
          `Theme: ${build.theme}`,
          "Status: Shaping",
          "",
          "Your theme is being shaped. You can:",
          "  - Confirm it to start building",
          "  - Refine it with a new description"
        ];
        return {
          content: [{ type: "text", text: lines.join("\n") }]
        };
      }
      const steps = getBuildSteps(db2, build.id);
      const quizQuestionIds = collectQuizQuestionIds(steps);
      const quizPerformance = getQuizPerformance(db2, userId, quizQuestionIds);
      const text = formatBuildingStatus(build.theme, build.currentStep, steps, quizPerformance);
      return {
        content: [{ type: "text", text }]
      };
    }
  );
}

// src/tools/index.ts
function registerTools(server2, db2, userConfig2) {
  registerSubmitAnswer(server2, db2, userConfig2);
  registerGetProgress(server2, db2, userConfig2);
  registerGetCurriculum(server2, db2, userConfig2);
  registerGetSectionDetails(server2, db2, userConfig2);
  registerGetPracticeQuestion(server2, db2, userConfig2);
  registerStartAssessment(server2, db2, userConfig2);
  registerGetWeakAreas(server2, db2, userConfig2);
  registerGetStudyPlan(server2, db2, userConfig2);
  registerScaffoldProject(server2, db2, userConfig2);
  registerResetProgress(server2, db2, userConfig2);
  registerStartPracticeExam(server2, db2, userConfig2);
  registerSubmitExamAnswer(server2, db2, userConfig2);
  registerGetExamHistory(server2, db2, userConfig2);
  registerFollowUp(server2, db2, userConfig2);
  registerStartCapstoneBuild(server2, db2, userConfig2);
  registerCapstoneBuildStep(server2, db2, userConfig2);
  registerCapstoneBuildStatus(server2, db2, userConfig2);
}

// src/prompts/index.ts
import { z as z11 } from "zod";
function registerPrompts(server2, db2, userConfig2) {
  server2.prompt(
    "quiz_question",
    "Present a certification exam question with clickable A/B/C/D options",
    { questionId: z11.string().describe("Question ID to present") },
    async ({ questionId }) => {
      const questions = loadQuestions();
      const question = questions.find((q) => q.id === questionId);
      if (!question) {
        return { messages: [{ role: "user", content: { type: "text", text: "Question not found." } }] };
      }
      return {
        messages: [{
          role: "user",
          content: {
            type: "text",
            text: `**${question.scenario}**

${question.text}

  A) ${question.options.A}
  B) ${question.options.B}
  C) ${question.options.C}
  D) ${question.options.D}

Select your answer (A/B/C/D):`
          }
        }]
      };
    }
  );
  server2.prompt(
    "choose_mode",
    "Select a study mode for the current session",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: {
          type: "text",
          text: "How would you like to study?\n\n1. **Guided Capstone** \u2014 Work through the reference project touching all domains\n2. **Dynamic Exercises** \u2014 Targeted questions based on your weak areas\n3. **Quick Quiz** \u2014 Rapid-fire questions across all domains\n4. **Review Weak Areas** \u2014 Focus on topics you've struggled with\n\nChoose a mode (1-4):"
        }
      }]
    })
  );
  server2.prompt(
    "assessment_question",
    "Present an assessment question with A/B/C/D options",
    { questionId: z11.string().describe("Assessment question ID"), questionNumber: z11.string().describe("Current question number (1-15)") },
    async ({ questionId, questionNumber }) => {
      const question = loadQuestions().find((q) => q.id === questionId);
      if (!question) return { messages: [{ role: "user", content: { type: "text", text: "Question not found." } }] };
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: `**Assessment Question ${questionNumber}/15**

${question.scenario}

${question.text}

  A) ${question.options.A}
  B) ${question.options.B}
  C) ${question.options.C}
  D) ${question.options.D}

Select your answer:` }
        }]
      };
    }
  );
  server2.prompt(
    "choose_domain",
    "Select which domain to study",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: { type: "text", text: "Which domain would you like to study?\n\n1. **Agentic Architecture & Orchestration** (27%)\n2. **Tool Design & MCP Integration** (18%)\n3. **Claude Code Configuration & Workflows** (20%)\n4. **Prompt Engineering & Structured Output** (20%)\n5. **Context Management & Reliability** (15%)\n\nChoose a domain (1-5):" }
      }]
    })
  );
  server2.prompt(
    "choose_difficulty",
    "Select question difficulty level",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: { type: "text", text: "Choose your difficulty level:\n\n1. **Easy** \u2014 Concept recall and basic understanding\n2. **Medium** \u2014 Applied scenarios requiring analysis\n3. **Hard** \u2014 Complex multi-step reasoning\n\nSelect difficulty (1-3):" }
      }]
    })
  );
  server2.prompt(
    "post_answer_options",
    "Present options after answering a question",
    { wasCorrect: z11.string().describe("Whether the previous answer was correct") },
    async ({ wasCorrect }) => {
      const options = wasCorrect === "true" ? "1. **Next Question** \u2014 Continue with the next question\n2. **Explain Further** \u2014 Show a deeper explanation with code example\n3. **View Handout** \u2014 Read the concept lesson for this topic\n4. **Change Topic** \u2014 Switch to a different domain" : "1. **Next Question** \u2014 Continue with the next question\n2. **Explain Why I Was Wrong** \u2014 Show a detailed explanation with code example\n3. **View Concept Lesson** \u2014 Review the concept before continuing\n4. **Try Similar Question** \u2014 Get another question on this same topic";
      return {
        messages: [{
          role: "user",
          content: { type: "text", text: `What would you like to do next?

${options}

Choose an option (1-4):` }
        }]
      };
    }
  );
  server2.prompt(
    "skip_options",
    "Present options to skip or customize the current content",
    {},
    async () => ({
      messages: [{
        role: "user",
        content: { type: "text", text: "This topic has a concept lesson before the questions.\n\n1. **Read Lesson** \u2014 Learn the concept first (recommended for new topics)\n2. **Skip to Questions** \u2014 Go straight to practice questions\n3. **Quick Summary** \u2014 Get a 3-line summary then start questions\n\nChoose an option (1-3):" }
      }]
    })
  );
  server2.prompt(
    "confirm_action",
    "Confirm a destructive action like resetting progress",
    { action: z11.string().describe("The action to confirm") },
    async ({ action }) => ({
      messages: [{
        role: "user",
        content: { type: "text", text: `Are you sure?

This will ${action}. This action cannot be undone.

1. **Yes, proceed** \u2014 Confirm the action
2. **No, cancel** \u2014 Go back

Choose (1-2):` }
      }]
    })
  );
}

// src/resources/index.ts
import fs5 from "fs";
import path5 from "path";
import { fileURLToPath as fileURLToPath3 } from "url";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
var __dirname3 = path5.dirname(fileURLToPath3(import.meta.url));
function registerResources(server2, db2, userConfig2) {
  server2.resource(
    "handout",
    new ResourceTemplate("handout://{taskStatement}", {
      list: async () => {
        const curriculum = loadCurriculum();
        const resources = curriculum.domains.flatMap(
          (d) => d.taskStatements.map((ts) => ({
            uri: `handout://${ts.id}`,
            name: `${ts.id} \u2014 ${ts.title}`,
            mimeType: "text/markdown"
          }))
        );
        return { resources };
      }
    }),
    { mimeType: "text/markdown" },
    async (uri, { taskStatement }) => {
      const ts = taskStatement;
      const content = loadHandout(ts);
      recordHandoutView(db2, userConfig2.userId, ts);
      return {
        contents: [{
          uri: uri.href,
          text: content ?? `Handout for ${ts} is not yet available.`,
          mimeType: "text/markdown"
        }]
      };
    }
  );
  server2.resource(
    "reference-project",
    new ResourceTemplate("reference-project://{projectId}", {
      list: async () => ({
        resources: [
          { uri: "reference-project://capstone", name: "Capstone \u2014 Multi-Agent Research System", mimeType: "text/markdown" },
          { uri: "reference-project://d1-agentic", name: "D1 Mini \u2014 Agentic Loop", mimeType: "text/markdown" },
          { uri: "reference-project://d2-tools", name: "D2 Mini \u2014 Tool Design", mimeType: "text/markdown" },
          { uri: "reference-project://d3-config", name: "D3 Mini \u2014 Claude Code Config", mimeType: "text/markdown" },
          { uri: "reference-project://d4-prompts", name: "D4 Mini \u2014 Prompt Engineering", mimeType: "text/markdown" },
          { uri: "reference-project://d5-context", name: "D5 Mini \u2014 Context Management", mimeType: "text/markdown" }
        ]
      })
    }),
    { mimeType: "text/markdown" },
    async (uri, { projectId }) => {
      const id = projectId;
      const projectPath = path5.join(__dirname3, "..", "..", "projects", id, "README.md");
      const content = fs5.existsSync(projectPath) ? fs5.readFileSync(projectPath, "utf-8") : `Reference project "${id}" is not yet available. It will be added in the content creation phase.`;
      return {
        contents: [{ uri: uri.href, text: content, mimeType: "text/markdown" }]
      };
    }
  );
  server2.resource(
    "exam-info",
    "exam-info://overview",
    { mimeType: "text/markdown" },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        text: EXAM_INFO_MARKDOWN,
        mimeType: "text/markdown"
      }]
    })
  );
}
var EXAM_INFO_MARKDOWN = `# Claude Certified Architect \u2014 Foundations

## Exam Format
- Multiple choice (1 correct, 3 distractors)
- Scenario-based questions (4 of 6 scenarios per exam)
- Passing score: 720 / 1000

## Domain Weightings
| Domain | Weight |
|--------|--------|
| D1: Agentic Architecture & Orchestration | 27% |
| D2: Tool Design & MCP Integration | 18% |
| D3: Claude Code Configuration & Workflows | 20% |
| D4: Prompt Engineering & Structured Output | 20% |
| D5: Context Management & Reliability | 15% |

## Exam Scenarios
1. Customer Support Resolution Agent
2. Code Generation with Claude Code
3. Multi-Agent Research System
4. Developer Productivity with Claude
5. Claude Code for Continuous Integration
6. Structured Data Extraction
`;

// src/index.ts
var server = new McpServer({
  name: "connectry-architect",
  version: "0.1.0"
});
var dbPath = process.env["CONNECTRY_DB_PATH"] ?? getDefaultDbPath();
var db = createDatabase(dbPath);
var userConfig = loadOrCreateUserConfig();
registerTools(server, db, userConfig);
registerPrompts(server, db, userConfig);
registerResources(server, db, userConfig);
var transport = new StdioServerTransport();
await server.connect(transport);
//# sourceMappingURL=index.js.map