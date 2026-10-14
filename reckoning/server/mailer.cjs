// ===========================================================================
//  FORESTER: RECKONING — Copyright (c) 2026 Roan Fraese / DeadlyDog Productions
// ===========================================================================

// A letter sent by email: just enough SMTP to hand one message to a mail server (Gmail's, with an app password) and
// be told it's taken — over TLS from the first byte (port 465), or plain for a test server. Nothing but Node's own.

const tls = require("tls"), net = require("net"), crypto = require("crypto");

const b64 = s => Buffer.from(String(s), "utf8").toString("base64");
const wrap = s => s.replace(/.{1,76}/g, "$&\r\n").trim();
const word = s => /^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${b64(s)}?=`;

// { host, port, secure, user, pass, from, fromName, to, subject, text, html } → resolves once the server has the letter
function send(o) {
  return new Promise((ok, no) => {
    const port = +o.port || 465, secure = o.secure !== false;
    const sock = secure ? tls.connect({ host: o.host, port, servername: o.host }) : net.connect({ host: o.host, port });
    sock.setTimeout(20000, () => sock.destroy(new Error("the mail server stopped answering")));
    let buf = "", step = 0, done = false;
    const finish = e => { if (done) return; done = true; try { sock.end(); } catch (x) {} e ? no(e) : ok(); };
    sock.on("error", finish); sock.on("close", () => finish(step < 9 ? new Error("the mail server hung up") : null));
    const say = l => sock.write(l + "\r\n");
    const id = `<${crypto.randomBytes(12).toString("hex")}@${(o.from.split("@")[1] || "localhost")}>`, bound = "b" + crypto.randomBytes(10).toString("hex");
    const letter = [
      `From: ${word(o.fromName || "")} <${o.from}>`, `To: <${o.to}>`, `Subject: ${word(o.subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: ${id}`,
      "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${bound}"`, "",
      `--${bound}`, "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(o.text)), "",
      `--${bound}`, "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64", "", wrap(b64(o.html || o.text)), "",
      `--${bound}--`, "",
    ].join("\r\n");
    // each answer, in turn: what it must be, and what's said next
    const want = [
      [220, () => say("EHLO forester-reckoning")],
      [250, () => say("AUTH LOGIN")],
      [334, () => say(b64(o.user))],
      [334, () => say(b64(o.pass))],
      [235, () => say(`MAIL FROM:<${o.from}>`)],
      [250, () => say(`RCPT TO:<${o.to}>`)],
      [250, () => say("DATA")],
      [354, () => sock.write(letter.replace(/^\./gm, "..") + "\r\n.\r\n")],
      [250, () => { say("QUIT"); step = 9; finish(null); }],
    ];
    sock.on("data", d => {
      buf += d.toString("utf8");
      // (a reply is done at its last line: the code and a space, not a dash)
      let m; while ((m = buf.match(/^(\d{3})([ -])(.*)\r?\n/m))) {
        const end = buf.indexOf("\n", m.index) + 1, line = buf.slice(0, end); buf = buf.slice(end);
        if (m[2] === "-") continue;
        const code = +m[1], [need, next] = want[step] || [];
        if (code !== need) return finish(new Error(`the mail server said: ${line.trim().slice(0, 200)}`));
        step++; next();
      }
    });
  });
}

module.exports = { send };
