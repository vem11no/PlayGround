#!/usr/bin/env bash
set -euo pipefail

TIMEFORMAT='capture.sh real %R user %U sys %S'
time {
  cd "$(dirname "$0")"

  : "${CAPTURE_URL:?CAPTURE_URL is required}"
  : "${CAPTURE_DIR:?CAPTURE_DIR is required}"

  mkdir -p "$CAPTURE_DIR"

  browser="${CHROME_BIN:-/usr/bin/chromium}"
  if [[ ! -x "$browser" ]]; then
    browser="$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)"
  fi
  if [[ -z "$browser" || ! -x "$browser" ]]; then
    echo "Temporary capture infrastructure failure: Chromium unavailable" >&2
    exit 75
  fi

  common=(--headless=new --no-sandbox --disable-dev-shm-usage --disable-gpu --hide-scrollbars)

  for attempt in 1 2 3; do
    if /usr/bin/time -p curl --fail --silent --show-error --location --max-time 20 -o /dev/null "$CAPTURE_URL"; then
      break
    fi
    if [[ "$attempt" == 3 ]]; then
      echo "Temporary navigation failure: cannot reach $CAPTURE_URL" >&2
      exit 75
    fi
    sleep 2
  done

  if ! /usr/bin/time -p "$browser" "${common[@]}" --window-size=1440,900 --virtual-time-budget=5000 --screenshot="$CAPTURE_DIR/final-desktop.png" "$CAPTURE_URL" >"$CAPTURE_DIR/desktop-browser.log" 2>&1; then
    echo "Temporary browser infrastructure failure during desktop capture" >&2
    exit 75
  fi

  if ! /usr/bin/time -p "$browser" "${common[@]}" --window-size=390,844 --force-device-scale-factor=1 --virtual-time-budget=5000 --screenshot="$CAPTURE_DIR/final-mobile.png" "$CAPTURE_URL" >"$CAPTURE_DIR/mobile-browser.log" 2>&1; then
    echo "Temporary browser infrastructure failure during mobile capture" >&2
    exit 75
  fi

  for image in "$CAPTURE_DIR/final-desktop.png" "$CAPTURE_DIR/final-mobile.png"; do
    if [[ ! -s "$image" ]]; then
      echo "Rendering defect: screenshot was not created: $image" >&2
      exit 1
    fi
  done

  echo "Captured $CAPTURE_DIR/final-desktop.png and $CAPTURE_DIR/final-mobile.png"
}
