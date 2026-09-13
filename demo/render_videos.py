from PIL import Image, ImageDraw, ImageFont
from pathlib import Path
import sys
from functools import lru_cache
import math, shutil, subprocess

ROOT=Path(__file__).resolve().parent.parent; OUT=ROOT/'artifacts/milestonepay-demo'; TMP=OUT/'.render-frames'; OUT.mkdir(parents=True,exist_ok=True)
FONT='/System/Library/Fonts/Helvetica.ttc'; BOLD='/System/Library/Fonts/HelveticaNeue.ttc'; MONO='/System/Library/Fonts/Courier.ttc'
@lru_cache(maxsize=None)
def ft(n,b=False,m=False): return ImageFont.truetype(MONO if m else (BOLD if b else FONT),n)
BG=(24,26,32); SIDE=(21,22,27); CARD=(33,35,41); LINE=(57,60,70); TEXT=(241,243,246); MUTED=(151,155,167); CYAN=(83,215,226); PURPLE=(140,99,255); GREEN=(105,234,166); RED=(255,151,144); AMBER=(244,206,98)
def rect(d,b,fill,outline=None,r=8,w=1): d.rounded_rectangle(b,r,fill,outline,width=w)
def tx(d,p,s,size=13,c=TEXT,b=False,m=False): d.text(p,s,font=ft(size,b,m),fill=c)
def line(d,a,b,c=LINE,w=1): d.line((a,b),fill=c,width=w)
def pill(d,x,y,s,c,fg=(15,25,30)):
    w=10+len(s)*6.25; rect(d,(x,y,x+w,y+20),c,None,10); tx(d,(x+6,y+5),s,9,fg,True); return w
def button(d,x,y,s,kind='cyan'):
    w=18+len(s)*7; fill=CYAN if kind=='cyan' else (31,33,39); fg=(20,37,43) if kind=='cyan' else TEXT; rect(d,(x,y,x+w,y+31),fill,LINE if kind!='cyan' else None,6); tx(d,(x+9,y+9),s,11,fg,True); return w
def cube(d,x,y):
    d.polygon([(x+20,y),(x+39,y+11),(x+20,y+23),(x+1,y+11)],fill=(140,99,255));d.polygon([(x+1,y+11),(x+20,y+23),(x+20,y+45),(x+1,y+34)],fill=(92,46,232));d.polygon([(x+20,y+23),(x+39,y+11),(x+39,y+34),(x+20,y+45)],fill=(58,25,171));
def chrome(d,path):
    d.rectangle((0,0,1280,78),fill=(37,39,46));rect(d,(14,8,228,35),(51,53,61),None,8);cube(d,22,12);tx(d,(50,15),'MilestonePay',11);tx(d,(213,15),'×',12,MUTED);tx(d,(241,15),'+',18,MUTED);tx(d,(18,47),'‹',22,MUTED);tx(d,(43,47),'›',22,MUTED);tx(d,(68,48),'↻',14,MUTED);rect(d,(96,43,1197,70),(20,21,26),(60,63,72),14);tx(d,(111,50),'⌁',12,MUTED);tx(d,(132,50),'milestonepay.app',11,CYAN,True);tx(d,(237,50),path,11,(210,213,221));tx(d,(1210,49),'☆',16,MUTED);tx(d,(1241,48),'⋮',18,MUTED)
def shell(d,path,role,active='Dashboard'):
    chrome(d,path);d.rectangle((0,78,206,720),fill=SIDE);line(d,(206,78),(206,720));cube(d,75,91);tx(d,(118,103),'Milestone',15,True);tx(d,(118,120),'Pay',15,PURPLE,True)
    for i,n in enumerate(['Dashboard','Deals','Activity','Explorer','Reputation']):
        y=151+i*40
        if n==active:rect(d,(10,y,196,y+33),(40,43,51),None,7)
        tx(d,(24,y+9),['▦','▤','◌','⌕','◇'][i],14,CYAN if n==active else MUTED);tx(d,(50,y+9),n,12,TEXT if n==active else (171,175,186))
    line(d,(12,642),(194,642));tx(d,(20,657),'Connected account',10,MUTED); addr={'client':'0xC11E…91A2','provider':'0xPr0V…22B7','arbiter':'0xArB1…52C9'}[role];name={'client':'Client Wallet','provider':'Provider Wallet','arbiter':'Arbiter Wallet'}[role];tx(d,(20,675),addr,11,TEXT,m=True);rect(d,(20,694,185,719),(29,31,37),LINE,6);tx(d,(29,701),name+'  ⌄',10,(222,225,232))
    line(d,(206,129),(1280,129));tx(d,(230,97),'☰',16,MUTED);tx(d,(665,98),'Avalanche Fuji · Testnet',12,(174,178,190));button(d,1098,89,'＋  New agreement')
def head(d,ey,title,sub):tx(d,(245,159),ey.upper(),10,CYAN,True);tx(d,(245,178),title,27,TEXT,True);tx(d,(245,212),sub,12,MUTED)
def metric(d,x,label,val,detail):rect(d,(x,255,x+205,335),CARD,LINE,9);tx(d,(x+15,270),label,10,MUTED);tx(d,(x+15,289),val,22,TEXT,True);tx(d,(x+15,315),detail,10,MUTED)
def dashboard(d):
    head(d,'Overview','Your agreements','Live protocol history for your connected wallet.');button(d,1081,193,'＋  New agreement')
    for i,a in enumerate([('Active escrowed','—','Across active agreements'),('Open agreements','0','0 in dispute'),('Completed settlements','—','Verified protocol outcomes'),('Reputation signal','—','Based on protocol history')]):metric(d,245+i*216,*a)
    tx(d,(245,365),'Open agreements',14,TEXT,True);tx(d,(245,385),'Active agreements and disputes requiring attention.',10,MUTED);rect(d,(245,405,850,545),CARD,LINE,9);tx(d,(427,470),'Create an agreement to secure the first milestone in escrow.',12,MUTED)
    tx(d,(875,365),'Recent activity',14,TEXT,True);tx(d,(875,385),'Latest indexed protocol events.',10,MUTED);rect(d,(875,405,1228,545),CARD,LINE,9);tx(d,(890,423),'Protocol history',11,TEXT,True);tx(d,(895,461),'◌',13,CYAN);tx(d,(922,454),'Awaiting first agreement',11,TEXT,True);tx(d,(922,472),'New protocol events will appear here.',10,MUTED)
def input(d,x,y,label,value,wide=510):tx(d,(x,y),label,11,TEXT,True);rect(d,(x,y+17,x+wide,y+52),(24,26,32),LINE,6);tx(d,(x+10,y+28),value or ('e.g. Website redesign' if label=='Agreement name' else '0x…' if 'wallet' in label else 'Describe the deliverable' if label=='Milestone 1' else '0.00'),11,TEXT if value else (112,116,128),m='wallet' in label)
def create(d,vals):
    head(d,'New agreement','Create an agreement','Define parties and milestones before funding escrow.');
    for i,s in enumerate(['1  Agreement','2  Milestones','3  Review']):tx(d,(245+i*135,253),s,11,TEXT if i==0 else MUTED,True)
    rect(d,(245,280,970,635),CARD,LINE,9);input(d,270,300,'Agreement name',vals[0],670);input(d,270,370,'Provider wallet',vals[1],320);input(d,620,370,'Arbiter wallet',vals[2],320);input(d,270,440,'Milestone 1',vals[3],670);input(d,270,510,'Amount (Mock USDT)',vals[4],670);line(d,(270,580),(945,580));tx(d,(270,598),'Review period · 7 days',10,MUTED);button(d,799,588,'Review agreement')
def modal(d,title,body,rows,confirm):
    d.rectangle((0,78,1280,720),fill=(8,9,12,155));rect(d,(444,213,836,512),(34,37,44),(73,77,89),11);cube(d,468,234);tx(d,(515,236),'Core Wallet',12,TEXT,True);tx(d,(515,253),'Avalanche Fuji',10,MUTED);tx(d,(468,289),title,19,TEXT,True);tx(d,(468,320),body,11,MUTED);rect(d,(468,346,812,420),(26,28,34),LINE,7)
    for i,(a,b) in enumerate(rows):tx(d,(480,359+i*20),a,10,MUTED);tx(d,(685,359+i*20),b,10,TEXT,True)
    button(d,630,460,'Cancel','outline');button(d,720,460,confirm)
def badge(d,x,y,s,kind):pill(d,x,y,s,{'active':(18,61,67),'funded':(23,61,46),'submitted':(75,59,24),'paid':(23,61,46),'disputed':(75,36,40),'resolved':(23,61,46)}[kind],{'submitted':AMBER,'disputed':RED}.get(kind,GREEN))
def deal(d,role,state):
    head(d,'Agreement','ETHRome Demo Website','Escrow  0x7B9E…4A21'); st={'funded':'ACTIVE','provider':'ACTIVE','submitted':'SUBMITTED','paid':'COMPLETED','disputed':'DISPUTED','resolved':'RESOLVED'}[state];kind={'funded':'active','provider':'active','submitted':'submitted','paid':'paid','disputed':'disputed','resolved':'resolved'}[state];badge(d,1088,165,st,kind)
    if state in ('funded','provider'):badge(d,1150,165,'FUNDED','funded')
    rect(d,(245,250,915,572),CARD,LINE,10);tx(d,(265,271),'Milestone 1',10,MUTED);tx(d,(265,291),'Responsive landing page + source files',16,TEXT,True);badge(d,780,274,{'funded':'FUNDED','provider':'FUNDED','submitted':'SUBMITTED','paid':'PAID','disputed':'UNDER REVIEW','resolved':'RESOLVED'}[state],kind if state!='provider' else 'funded');line(d,(265,322),(895,322));tx(d,(265,341),'Milestone value',11,MUTED);tx(d,(780,341),'250.00 mUSDT',12,TEXT,True)
    if state in ('funded','provider'):rect(d,(265,370,895,413),(20,42,45),(36,78,83),7);tx(d,(277,385),'250.00 mUSDT locked in escrow. Funds are available for Milestone 1.',11,(199,241,243));
    if state=='provider':button(d,265,438,'Submit milestone')
    if state=='submitted':
        rect(d,(265,370,895,410),(20,42,45),(36,78,83),7);tx(d,(277,384),'Waiting for client review',11,(199,241,243));rect(d,(265,425,895,507),(27,29,35),LINE,7);tx(d,(278,440),'Private evidence transport',11,TEXT,True);tx(d,(278,459),'Swarm ACT · Encrypted evidence + on-chain commitment',10,MUTED);tx(d,(278,481),'Evidence commitment: 0x83f1…aa91',10,(181,187,200),m=True)
    if state=='paid':rect(d,(265,370,895,410),(20,42,45),(36,78,83),7);tx(d,(277,384),'Settlement confirmed on Avalanche Fuji',11,(199,241,243));tx(d,(265,435),'Released to provider',11,MUTED);tx(d,(752,435),'250.00 mUSDT',12,TEXT,True);tx(d,(265,462),'Transaction',11,MUTED);tx(d,(752,462),'0xa19c…8f20',10,(181,187,200),m=True)
    if state=='disputed':
        rect(d,(265,370,895,410),(45,29,32),(115,65,68),7);tx(d,(277,384),'Funds remain locked while the dispute is resolved.',11,(255,208,203));rect(d,(265,425,895,525),(27,29,35),LINE,7);tx(d,(278,440),'Committed evidence',11,TEXT,True);tx(d,(278,463),'Provider delivery',10,MUTED);tx(d,(710,463),'0x83f1…aa91',10,(181,187,200),m=True);tx(d,(278,483),'Client dispute snapshot',10,MUTED);tx(d,(710,483),'0x29a0…1c77',10,(181,187,200),m=True);badge(d,278,494,'SEALED','active');tx(d,(265,541),'Client claim: Delivery does not match the agreed responsive layout.',10,MUTED);rect(d,(245,590,915,690),CARD,LINE,9);tx(d,(265,608),'Release decision',12,TEXT,True);tx(d,(265,628),'Release 100% to provider · 250.00 mUSDT',11,MUTED);button(d,265,648,'Resolve dispute')
    if state=='resolved':rect(d,(265,370,895,410),(20,42,45),(36,78,83),7);tx(d,(277,384),'250.00 mUSDT released to provider',11,(199,241,243));tx(d,(265,435),'Decision tx',11,MUTED);tx(d,(752,435),'0x71dd…ee03',10,(181,187,200),m=True)
    rect(d,(940,250,1228,475),CARD,LINE,9);tx(d,(960,270),'Escrow summary',12,TEXT,True)
    released='250.00' if state in ('paid','resolved') else '0.00'; held='0.00' if state in ('paid','resolved') else '250.00'
    for i,(a,b) in enumerate([('Agreement value','250.00 mUSDT'),('Released',released+' mUSDT'),('Held in escrow',held+' mUSDT'),('Asset','Mock USDT')]):tx(d,(960,302+i*28),a,10,MUTED);tx(d,(1095,302+i*28),b,10,TEXT,True)
    rect(d,(940,490,1228,650),CARD,LINE,9);tx(d,(960,510),'Parties',12,TEXT,True)
    for i,(a,b) in enumerate([('CLIENT','0xC11E…91A2'),('PROVIDER','0xPr0V…22B7'),('ARBITER','0xArB1…52C9')]):tx(d,(960,539+i*35),a,9,MUTED,True);tx(d,(960,552+i*35),b,10,(184,190,202),m=True)
def submit_modal(d,note):
    d.rectangle((0,78,1280,720),fill=(8,9,12,155));rect(d,(405,190,875,535),(34,37,44),(73,77,89),11);tx(d,(430,214),'Submit milestone',19,TEXT,True);tx(d,(430,245),'Your delivery remains private. Only a commitment is recorded by the protocol.',10,MUTED);input(d,430,275,'Delivery note',note,420);rect(d,(430,365,850,426),(26,28,34),LINE,7);tx(d,(443,380),'Private evidence transport',11,TEXT,True);tx(d,(443,399),'Swarm ACT · Encrypted evidence + on-chain commitment',10,MUTED);button(d,638,473,'Cancel','outline');button(d,729,473,'Submit milestone')
def overlay(d,thought,cursor,click=False):
    rect(d,(840,642,1258,708),(13,15,20),(70,180,188),8);tx(d,(854,653),'USER THOUGHT',9,CYAN,True);wrap(d,thought,(854,669),390,11,(239,248,248));rect(d,(220,691,420,712),(25,27,33),(73,80,91),5);tx(d,(227,698),'Demo recording · simulated Fuji state',8,(188,193,204));x,y=cursor
    if click:d.ellipse((x-14,y-14,x+14,y+14),outline=CYAN,width=2)
    d.polygon([(x,y),(x+4,y+19),(x+8,y+13),(x+13,y+22),(x+16,y+20),(x+10,y+11),(x+17,y+10)],fill=(248,248,248),outline=(15,15,15))
def wrap(d,s,p,w,size,c):
    words=s.split();line_='';y=p[1]
    for word in words:
        test=(line_+' '+word).strip()
        if d.textlength(test,font=ft(size))>w:tx(d,(p[0],y),line_,size,c);y+=size+3;line_=word
        else:line_=test
    tx(d,(p[0],y),line_,size,c)
def move(t,pts):
    for a,b,p,q in pts:
        if a<=t<=b:
            z=(t-a)/(b-a);z=z*z*(3-2*z);return (p[0]+(q[0]-p[0])*z,p[1]+(q[1]-p[1])*z)
    return pts[-1][3]
def frame(role,t):
    im=Image.new('RGB',(1280,720),BG);d=ImageDraw.Draw(im)
    if role=='client':
        if t<2: shell(d,'/deals',role);dashboard(d);thought="I want to hire someone, but I don't want to send the money directly and just hope the work gets delivered."
        elif t<11: shell(d,'/deals/new',role);n=max(0,min(5,int((t-3.2)/1.25)+1));vals=['ETHRome Demo Website','0xPr0V…22B7','0xArB1…52C9','Responsive landing page + source files','250.00'];create(d,vals[:n]+['']*(5-n));thought="I'll define the agreement first. The deliverable and the people involved should be explicit before funds move."
        elif t<16: shell(d,'/deals/new/review',role);create(d,['ETHRome Demo Website','0xPr0V…22B7','0xArB1…52C9','Responsive landing page + source files','250.00']);rect(d,(245,280,970,635),CARD,LINE,9);tx(d,(270,305),'Review agreement',20,TEXT,True);rows=[('Agreement','ETHRome Demo Website'),('Provider','0xPr0V…22B7'),('Arbiter','0xArB1…52C9'),('Milestone 1','Responsive landing page + source files'),('Amount','250.00 mUSDT')];
        
        if 11<=t<16:
            for i,(a,b) in enumerate(rows):tx(d,(275,345+i*42),a,11,MUTED);tx(d,(570,345+i*42),b,11,TEXT,True,m=a in ('Provider','Arbiter'))
            button(d,740,570,'Create & fund agreement');thought="I can see exactly which provider wallet will be paid, and an arbiter is already defined in case we disagree."
        if 16<=t<20:
            shell(d,'/deals/new/review',role);create(d,['ETHRome Demo Website','0xPr0V…22B7','0xArB1…52C9','Responsive landing page + source files','250.00']);modal(d,'Create agreement','Review this simulated wallet request before confirming.',[('Escrow funding','250.00 mUSDT'),('Network fee','~0.001 AVAX'),('Network','Avalanche Fuji')],'Confirm');thought="The wallet confirmation is important — the application cannot move my funds without my approval."
        if t>=20: shell(d,'/deals/0x7B9E…4A21',role);deal(d,role,'funded');thought="The money is committed, but it hasn't been released to the provider yet. The provider can verify the funds before doing any work."
        pts=[(0,1.8,(1100,650),(1140,104)),(2,3.4,(1140,104),(350,330)),(3.4,9.5,(350,330),(600,530)),(9.5,11,(600,530),(840,603)),(11,14.7,(840,603),(860,570)),(14.7,16,(860,570),(775,476)),(16,19.5,(775,476),(760,475)),(19.5,21,(760,475),(780,470)),(21,34,(780,470),(1060,330))]
    elif role=='provider':
        shell(d,'/deals/0x7B9E…4A21',role)
        if t<8:deal(d,role,'provider');thought="Before I start working, I want proof the client actually committed the money." if t<5 else "The agreement is addressed to my wallet, the amount is fixed, and payment is tied to the milestone."
        elif t<15:deal(d,role,'provider');note='Landing page completed and ready for review.'[:max(0,int((t-10)*18))];submit_modal(d,note);thought="I've finished the work, so I submit the milestone instead of asking the client to manually send me money."
        elif t<23:deal(d,role,'submitted');thought="Submitting does not automatically pay me. The client still has to review the milestone."
        else:deal(d,role,'paid');thought="After the client approves, the escrow releases the payment to my wallet. Payment follows the agreement state instead of relying on a promise."
        pts=[(0,7.8,(1080,620),(320,452)),(7.8,9,(320,452),(765,486)),(9,14.8,(765,486),(765,486)),(14.8,16,(765,486),(450,390)),(16,23,(450,390),(1040,300)),(23,33,(1040,300),(770,435))]
    else:
        shell(d,'/deals/0x7B9E…4A21',role);deal(d,role,'disputed' if t<18 else 'resolved');thought="I shouldn't be involved in normal payments. I only enter the flow when the client and provider disagree." if t<6 else "I can compare committed evidence from both sides instead of relying on an editable chat message." if t<13 else "Based on the evidence in this demo, I decide the milestone was delivered and release the escrow to the provider." if t<18 else "The dispute now has a clear final state recorded by the protocol instead of remaining an off-platform argument."
        if 13<=t<18:modal(d,'Resolve dispute','Release 100% of the disputed milestone to the provider.',[('Provider payout','250.00 mUSDT'),('Network','Avalanche Fuji')],'Confirm resolution')
        pts=[(0,12.7,(1090,625),(450,502)),(12.7,14,(450,502),(770,475)),(14,17.8,(770,475),(770,475)),(17.8,30,(770,475),(770,435))]
    cur=move(t,pts);overlay(d,thought,cur,any(abs(t-x)<.18 for x in ([2,11,16,20] if role=='client' else [8,15,23] if role=='provider' else [13,18])))
    return im
def render(role,duration,name):
    shutil.rmtree(TMP,ignore_errors=True);TMP.mkdir();fps=24
    for i in range(duration*fps):frame(role,i/fps).save(TMP/f'{i:05d}.png',compress_level=2)
    subprocess.run(['ffmpeg','-y','-framerate',str(fps),'-i',str(TMP/'%05d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart','-crf','18',str(OUT/name)],check=True)
targets={'client':(30,'01_client_create_and_fund.mp4'),'provider':(30,'02_provider_submit_and_get_paid.mp4'),'arbiter':(30,'03_arbiter_resolve_dispute.mp4')}
for role in (sys.argv[1:] or targets): render(role,*targets[role])
shutil.rmtree(TMP,ignore_errors=True)
