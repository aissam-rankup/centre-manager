r"""
Script SQL UTF-8 -> script SQL 100 % ASCII, pour la production (SQL editor de Supabase).

Pourquoi : un script UTF-8 colle dans le SQL editor a ete relu en Windows-1252
(« Mathématiques » est devenu « MathÃ©matiques » en production, octobre 2026).
Un fichier ASCII ne peut pas etre altere ainsi.

  * commentaires : accents retires ;
  * chaines accentuees : litteraux Unicode U&'r\00e9serv\00e9e' ;
  * PL/pgSQL : « raise exception U&'...' » devient « raise exception '%', U&'...' »
    (RAISE n'accepte pas U& comme format ; garder en ASCII les RAISE a parametres) ;
  * echoue s'il reste un caractere non ASCII.

Usage : python supabase/scripts/sql_to_ascii.py entree.sql sortie.sql [entete.sql]
Toujours tester le fichier produit sur une base locale avant de le transmettre.
"""

import re
import sys
import unicodedata

REPLACEMENTS = {"«": '"', "»": '"', "—": "-", "–": "-", "’": "'", "…": "...", "→": "->"}

# Litteral SQL simple ('...' avec '' doubles), hors U&'...' deja converti.
LITERAL = re.compile(r"(?<![A-Za-z0-9_&])'((?:[^']|'')*)'")
RAISE_UNICODE = re.compile(r"(raise\s+(?:exception|notice|warning)\s+)(U&'(?:[^']|'')*')", re.IGNORECASE)


def translit(text: str) -> str:
    for source, target in REPLACEMENTS.items():
        text = text.replace(source, target)
    return unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")


def escape_literal(match: re.Match) -> str:
    body = match.group(1)
    if all(ord(char) < 128 for char in body):
        return match.group(0)
    if "\\" in body:
        raise ValueError("litteral avec antislash non pris en charge : " + match.group(0))
    escaped = "".join(char if ord(char) < 128 else "\\%04x" % ord(char) for char in body)
    return "U&'" + escaped + "'"


def convert(source: str) -> str:
    out = []
    for line in source.splitlines():
        if line.lstrip().startswith("--"):
            out.append(translit(line))
            continue
        code, separator, comment = line.partition(" -- ")
        code = LITERAL.sub(escape_literal, code)
        code = RAISE_UNICODE.sub(r"\1'%', \2", code)
        out.append(code + (separator + translit(comment) if separator else ""))
    return "\n".join(out) + "\n"


def main() -> None:
    if len(sys.argv) not in (3, 4):
        sys.exit(__doc__)
    src, dst = sys.argv[1], sys.argv[2]
    header = (
        open(sys.argv[3], encoding="ascii").read().rstrip("\n")
        if len(sys.argv) == 4
        else "-- Genere par supabase/scripts/sql_to_ascii.py (100 % ASCII) depuis " + src
    )
    text = header + "\n" + convert(open(src, encoding="utf-8").read())
    remaining = [(number, line) for number, line in enumerate(text.splitlines(), 1) if any(ord(c) > 127 for c in line)]
    if remaining:
        sys.exit("caracteres non ASCII restants : %r" % remaining[:5])
    open(dst, "w", encoding="ascii", newline="\n").write(text)
    print("ok", dst)


if __name__ == "__main__":
    main()
