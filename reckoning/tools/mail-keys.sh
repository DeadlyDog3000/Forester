#!/bin/bash
# Lets the game server email each buyer their licence key — the password typed here, sent over ssh, never shown or kept
# anywhere else. (The Stripe settings already on the server are left as they are.)
#   bash ~/Forester/reckoning/tools/mail-keys.sh
# Brevo (no phone needed): brevo.com → sign up → Senders, domains & IPs → add deadlydogdev@gmail.com as a sender and
# click the link it emails you → SMTP & API → SMTP tab → "Generate a new SMTP key". That page shows your SMTP login.
# Gmail (needs 2-Step Verification): myaccount.google.com/apppasswords → the 16-letter app password.
set -e
read -rp "Brevo or Gmail? (b/g, Enter for Brevo): " W
read -rp "Address the emails come from (Enter for deadlydogdev@gmail.com): " F; F=${F:-deadlydogdev@gmail.com}
if [ "$W" = g -o "$W" = G ]; then
  H=smtp.gmail.com; U=$F
  read -rsp "Gmail app password (16 letters, hidden): " P; echo; P=$(printf %s "$P" | tr -d ' ')
  [ ${#P} -eq 16 ] || { echo "An app password is 16 letters — that was ${#P}. Try again (paste it once)."; exit 1; }
else
  H=smtp-relay.brevo.com
  read -rp "Brevo SMTP login (on the SMTP page, looks like 1a2b3c@smtp-brevo.com): " U
  read -rsp "Brevo SMTP key (hidden as you type — paste it once): " P; echo
  case "$P" in xsmtpsib-*) ;; *) echo "A Brevo SMTP key starts with xsmtpsib- . (The API key, xkeysib-, isn't the one.)"; exit 1;; esac
fi
printf 'SMTP_HOST=%s\nSMTP_PORT=465\nSMTP_USER=%s\nSMTP_PASS=%s\nSMTP_FROM=%s\n' "$H" "$U" "$P" "$F" | ssh root@45.76.245.44 'f=/home/forester/world-data/stripe.env; t=$(mktemp); grep -v "^SMTP_" $f > $t || true; cat >> $t; install -m 600 -o forester -g forester $t $f; rm -f $t; echo "Saved on the server."'
unset P
echo "Within a minute or two, the server emails the key for your test purchase to the address you paid with — check your inbox (and spam)."
