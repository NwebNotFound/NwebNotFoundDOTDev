# Erzeugt public/mc/heads/steve.png: das Gesicht des Vanilla-Default-Skins ("Steve"), gleiche
# Crop- und Upscale-Logik wie scripts/gen-heads.py für die Mob-Köpfe.
# Quelle: InventivetalentDev/minecraft-assets@1.21.11 assets/minecraft/textures/entity/player/wide/steve.png
# (dieselbe Asset-Quelle wie /mc-icon und die Mob-Köpfe). Texturen © Mojang; Nutzung analog zu den
# bestehenden Item-Icons.
#
# Wozu: /mc-head/<name> braucht diesen Kopf als letzten Ausweg, wenn keine Skin-Quelle (Ingest,
# Mojang, minotar, mc-heads) erreichbar ist. Ohne ihn leitete der Endpunkt auf
# /mc-icon/v2/player_head → mc-heads.net weiter, also ins Netz; offline blieb das <img> kaputt.
#
# Aufruf: python3 scripts/gen-steve-head.py   (lädt den Skin nach /tmp und schreibt den Kopf ins Repo)
import hashlib
import os
import urllib.request

SRC = ("https://raw.githubusercontent.com/InventivetalentDev/minecraft-assets/1.21.11/"
       "assets/minecraft/textures/entity/player/wide/steve.png")
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "public", "mc", "heads", "steve.png")
RAW = "/tmp/steve-skin.png"

if not os.path.exists(RAW):
    urllib.request.urlretrieve(SRC, RAW)

from PIL import Image  # noqa: E402

im = Image.open(RAW).convert("RGBA")
face = im.crop((8, 8, 16, 16))   # Vorderseite des Kopf-Würfels
face.alpha_composite(im.crop((40, 8, 48, 16)))  # Hut-/Overlay-Layer darüber
face.resize((64, 64), Image.NEAREST).save(OUT, optimize=True)
print("wrote", os.path.abspath(OUT), os.path.getsize(OUT), "bytes",
      hashlib.sha256(open(OUT, "rb").read()).hexdigest()[:16])
