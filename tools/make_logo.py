from PIL import Image, ImageDraw, ImageFilter, ImageChops
import numpy as np, math, sys
src = Image.open(sys.argv[1]).convert('RGB')
a = np.asarray(src).astype(float)
lum = a.mean(axis=2)
mask = np.clip((118 - lum) / 38, 0, 1) ** 0.8
mask[:, :135] = 0; mask[:, 615:] = 0; mask[:320, :] = 0; mask[705:, :] = 0
m = Image.fromarray((mask*255).astype('uint8')).crop((136, 320, 614, 704))
S = 1024; c = S/2
yy, xx = np.mgrid[0:S,0:S]
r = np.hypot(xx-c*0.80, yy-c*0.70) / (S*0.62)
g1 = np.array([255, 240, 175]); g2 = np.array([230, 170, 40]); g3 = np.array([156, 96, 14])
t = np.clip(r,0,1)[...,None]
col = np.where(t<0.55, g1 + (g2-g1)*(t/0.55), g2 + (g3-g2)*((t-0.55)/0.45))
disk = np.hypot(xx-c, yy-c) <= S*0.48
rgba = np.zeros((S,S,4)); rgba[...,:3] = col; rgba[...,3] = disk*255
out = Image.fromarray(rgba.astype('uint8'), 'RGBA')
d = ImageDraw.Draw(out)
rr = S*0.48 - 13
for w,colr in [(26,(132,80,8,255)),(15,(255,212,96,255)),(5,(255,250,222,255))]:
    d.ellipse([c-rr,c-rr,c+rr,c+rr], outline=colr, width=w)
rr = S*0.405
d.ellipse([c-rr,c-rr,c+rr,c+rr], outline=(140,88,14,140), width=4)
iw = int(S*0.58); ih = int(m.height*iw/m.width)
mi = m.resize((iw, ih), Image.LANCZOS)
icon = Image.new('RGBA', (iw, ih), (74,40,12,255)); icon.putalpha(mi)
glow = Image.new('RGBA',(S,S),(0,0,0,0)); gl = Image.new('RGBA',(iw,ih),(255,250,215,220)); gl.putalpha(mi)
px, py = int(c-iw/2), int(c-ih/2)+6
glow.paste(gl,(px,py),gl); glow = glow.filter(ImageFilter.GaussianBlur(16))
out = Image.alpha_composite(out, glow)
out.paste(icon,(px,py),icon)
hl = Image.new('L',(S,S),0); hd = ImageDraw.Draw(hl)
hd.ellipse([c-S*0.36, c-S*0.45, c+S*0.30, c-S*0.08], fill=80)
hl = hl.filter(ImageFilter.GaussianBlur(34))
hl = ImageChops.multiply(hl, Image.fromarray((disk*255).astype('uint8')))
white = Image.new('RGBA',(S,S),(255,255,255,0)); white.putalpha(hl)
out = Image.alpha_composite(out, white)
st = Image.new('RGBA',(S,S),(0,0,0,0)); sd = ImageDraw.Draw(st)
sx, sy = c+S*0.29, c-S*0.31
for ang,ln,wd in [(0,74,7),(90,74,7),(45,26,5),(135,26,5)]:
    a_ = math.radians(ang)
    sd.line([sx-ln*math.cos(a_), sy-ln*math.sin(a_), sx+ln*math.cos(a_), sy+ln*math.sin(a_)], fill=(255,255,245,255), width=wd)
sd.ellipse([sx-10,sy-10,sx+10,sy+10], fill=(255,255,250,255))
st = st.filter(ImageFilter.GaussianBlur(1.6))
out = Image.alpha_composite(out, st)
out.save('img/logo-1024.png', optimize=True)
for s in (512,192,64,32):
    out.resize((s,s), Image.LANCZOS).save(f'img/logo-{s}.png', optimize=True)
bg = Image.new('RGBA',(512,512),(33,22,12,255)); lg = out.resize((430,430), Image.LANCZOS); bg.paste(lg,(41,41),lg); bg.save('img/icon-maskable-512.png', optimize=True)
