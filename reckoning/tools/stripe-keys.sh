#!/bin/bash
# Puts the shop's Stripe settings on the game server — typed here, sent over ssh, never shown or kept anywhere else.
#   bash ~/Forester/reckoning/tools/stripe-keys.sh
# The secret key: Stripe dashboard → Developers → API keys (a restricted key is better: Checkout Sessions write,
# PaymentIntents read, Charges read). The price: Product catalogue → Forester: Reckoning → its price's ID (price_…).
# Test-mode keys (sk_test_/rk_test_) first, to try a purchase with Stripe's test card; then the live ones.
set -e
read -rsp "Stripe secret key (sk_… or rk_…, hidden as you type): " K; echo
read -rp  "Price ID (Enter for price_1UQGV8DrqvgAMdV8w2pnuRir): " P; P=${P:-price_1UQGV8DrqvgAMdV8w2pnuRir}
read -rp  "Let Stripe work out sales tax? Only once Stripe Tax is set up (y/N): " TX
case "$K" in sk_*|rk_*) ;; *) echo "That doesn't look like a Stripe secret key."; exit 1;; esac
case "$P" in price_*) ;; *) echo "That doesn't look like a price ID."; exit 1;; esac
{ printf 'STRIPE_SECRET_KEY=%s\nSTRIPE_PRICE=%s\n' "$K" "$P"; [ "$TX" = y -o "$TX" = Y ] && echo 'STRIPE_TAX=1'; } | ssh root@45.76.245.44 'umask 077; f=/home/forester/world-data/stripe.env; cat > $f && chown forester:forester $f && chmod 600 $f && echo "Saved on the server."'
unset K
echo "The shop says: $(curl -s http://45.76.245.44:47810/shop/status)"
