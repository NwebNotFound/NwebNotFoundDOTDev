# Erzeugt public/mc/heads/*.png: Gesichts-Crop (front face des Kopf-Würfels) aus Vanilla-Entity-Texturen,
# Quelle: InventivetalentDev/minecraft-assets@1.21.11 (assets/minecraft/textures/entity), dieselbe Quelle wie /mc-icon.
# Texturen © Mojang; Nutzung analog zu den bestehenden Item-Icons. Aufruf: Texturen nach cwd laden (Dateiname = Pfad mit _), dann python3 scripts/gen-heads.py
from PIL import Image
S={ # mob: (file, x,y,w,h, hat(x,y) or None)
'zombie':('zombie_zombie',8,8,8,8,(40,8)),'husk':('zombie_husk',8,8,8,8,(40,8)),'drowned':('zombie_drowned',8,8,8,8,None),
'skeleton':('skeleton_skeleton',8,8,8,8,None),'stray':('skeleton_stray',8,8,8,8,None),'wither_skeleton':('skeleton_wither_skeleton',8,8,8,8,None),
'creeper':('creeper_creeper',8,8,8,8,None),'spider':('spider_spider',40,12,8,8,None),'cave_spider':('spider_cave_spider',40,12,8,8,None),
'enderman':('enderman_enderman',8,8,8,8,None),'piglin':('piglin_piglin',8,8,10,8,None),'zombified_piglin':('piglin_zombified_piglin',8,8,10,8,None),'piglin_brute':('piglin_piglin_brute',8,8,10,8,None),
'pig':('pig_temperate_pig',8,8,8,8,None),'sheep':('sheep_sheep',8,8,6,6,None),'chicken':('chicken_temperate_chicken',3,3,4,6,None),
'witch':('witch',8,8,8,10,None),'blaze':('blaze',8,8,8,8,None),'slime':('slime_slime',8,8,8,8,None),'pillager':('illager_pillager',8,8,8,10,None),'vindicator':('illager_vindicator',8,8,8,10,None),
'villager':('villager_villager',8,8,8,10,None),'iron_golem':('iron_golem_iron_golem',8,8,8,10,None),'ghast':('ghast_ghast',16,16,16,16,None),'wolf':('wolf_wolf',4,4,6,6,None),'zombie_villager':('zombie_villager_zombie_villager',8,8,8,10,None)}
import os;out=os.path.join(os.path.dirname(os.path.abspath(__file__)),'..','public','mc','heads')+'/';sheet=Image.new('RGBA',(64*7,64*4),(40,40,40,255))
for i,(k,(f,x,y,w,h,hat)) in enumerate(S.items()):
  im=Image.open(f+'.png').convert('RGBA');face=im.crop((x,y,x+w,y+h))
  if hat: face.alpha_composite(im.crop((hat[0],hat[1],hat[0]+w,hat[1]+h)))
  n=max(w,h);c=Image.new('RGBA',(n,n));c.paste(face,((n-w)//2,(n-h)//2))
  big=c.resize((n*(64//n) if 64%n==0 else 64,)*2,Image.NEAREST).resize((64,64),Image.NEAREST);big.save(out+k+'.png',optimize=True)
  sheet.paste(big,((i%7)*64,(i//7)*64),big)

