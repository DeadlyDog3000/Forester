#!/bin/bash
# Lets the game server email each buyer their licence key, from your Gmail — the app password typed here, sent over
# ssh, never shown or kept anywhere else. (The Stripe settings already on the server are left as they are.)
#   bash ~/Forester/reckoning/tools/mail-keys.sh
# The app password: myaccount.google.com/apppasswords (2-Step Verification has to be on) → name it "Forester shop" →
# copy the 16 letters it shows.
set -e
read -rp  "Gmail address to send from (Enter for deadlydogdev@gmail.com): " U; U=${U:-deadlydogdev@gmail.com}
read -rsp "Its app password (16 letters, hidden as you type): " P; echo
P=$(printf %s "$P" | tr -d ' ')
case "$U" in *@*) ;; *) echo "That doesn't look like an email address."; exit 1;; esac
[ ${#P} -eq 16 ] || { echo "An app password is 16 letters — that was ${#P}. Try again (paste it once)."; exit 1; }
printf 'SMTP_USER=%s\nSMTP_PASS=%s\n' "$U" "$P" | ssh root@45.76.245.44 'f=/home/forester/world-data/stripe.env; t=$(mktemp); grep -v "^SMTP_" $f > $t || true; cat >> $t; install -m 600 -o forester -g forester $t $f; rm -f $t; echo "Saved on the server."'
unset P
echo "Within a minute or two, the server emails the key for your test purchase to the address you paid with — check your inbox."
