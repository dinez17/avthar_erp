#!/usr/bin/env bash
# ==========================================================================
# load_env_file — read KEY=VALUE pairs from an env file into the environment
# WITHOUT executing the file.
#
# `set -a; source .env.production` was the obvious approach and it is wrong.
# `source` runs the file as a shell script, so a perfectly valid password
# containing backticks or $(...) gets executed:
#
#     SMTP_PASSWORD=abc`jvfb`def
#     -> .env.production: line 62: jvfb: command not found
#
# That is both a crash and an arbitrary-code-execution path through a file
# full of secrets. This reads the file as data instead.
#
# Usage:
#     source "$(dirname "$0")/load-env.sh"
#     load_env_file .env.production
# ==========================================================================

load_env_file() {
    local file="$1" line key val

    if [[ ! -f "$file" ]]; then
        echo "load_env_file: $file not found" >&2
        return 1
    fi

    # `|| [[ -n "$line" ]]` catches a final line with no trailing newline.
    while IFS= read -r line || [[ -n "$line" ]]; do
        # Drop a trailing CR: the file may have been edited on Windows.
        line="${line%$'\r'}"

        # Trim leading whitespace, then skip blanks and comments.
        line="${line#"${line%%[![:space:]]*}"}"
        [[ -z "$line" || "$line" == \#* ]] && continue

        # KEY=VALUE, with an optional `export ` prefix.
        [[ "$line" =~ ^(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]] || continue

        key="${BASH_REMATCH[2]}"
        val="${BASH_REMATCH[3]}"

        # Strip one layer of matching surrounding quotes, the way dotenv does.
        if [[ ${#val} -ge 2 && "$val" == \"*\" ]]; then
            val="${val:1:${#val}-2}"
        elif [[ ${#val} -ge 2 && "$val" == \'*\' ]]; then
            val="${val:1:${#val}-2}"
        fi

        export "$key=$val"
    done <"$file"
}

# Docker Compose interpolates $VAR and ${VAR} inside env-file values, so a
# secret containing a bare '$' reaches the containers mangled or empty. Warn
# loudly rather than letting it fail hours later as a login that never works.
warn_on_dollar_values() {
    local file="$1" line key
    while IFS= read -r line || [[ -n "$line" ]]; do
        line="${line%$'\r'}"
        [[ "$line" =~ ^(export[[:space:]]+)?([A-Za-z_][A-Za-z0-9_]*)=(.*[\$].*)$ ]] || continue
        key="${BASH_REMATCH[2]}"
        echo "WARNING: $key contains a '\$'. Docker Compose treats \$VAR in an" >&2
        echo "         env file as a variable reference, so the value the app" >&2
        echo "         receives will not match what you typed. Escape it as \$\$" >&2
        echo "         or regenerate the secret without a '\$'." >&2
    done <"$file"
}
