"""Browser-scale medieval architecture, shipping and traveller meshes.

Physical shingles, recessed masonry joints, open gateways and stitched sails.
The generator supplies its shared PBR materials and primitive constructors.
"""
import math
import random
import bpy
from mathutils import Vector


def detailed_builders(api):
    cube, mesh, beam = (api[k] for k in ('cube', 'mesh', 'beam'))
    stone, plaster, wood, tint, iron, linen, shingles, leather, moss = (
        api[k] for k in ('stone', 'plaster', 'wood', 'roof', 'iron', 'cloth', 'shingle', 'leather', 'green'))
    rng = random.Random(81823)
    glass,metal=api['glass'],api['metal']

    def ellipsoid(name, p, scale, material, seg=12, rings=8):
        bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, radius=1, location=p)
        obj = bpy.context.object; obj.name=name; obj.scale=scale; obj.data.materials.append(material)
        for face in obj.data.polygons: face.use_smooth=True
        api['parts'].append(obj)
        return obj

    def flag(x,y,z,size=.125):
        beam('Flagstaff',(x,y,z),(x,y,z+size*1.6),.0028,wood)
        vv=[];ff=[]
        for i in range(7):
            t=i/6;yy=y+math.sin(t*math.pi*1.5)*size*.15
            vv.extend([(x+t*size,yy,z+size*(1.50-.08*t)),(x+t*size,yy,z+size*(.85-.08*t))])
        for i in range(6):ff.append((i*2,i*2+2,i*2+3,i*2+1))
        flag_mesh=mesh('Large_player_banner',vv,ff,tint)
        for face in flag_mesh.data.polygons:face.use_smooth=True
        # A sewn cream diamond gives each banner a readable heraldic center.
        center=(x+size*.40,y+size*.145,z+size*1.145)
        xx,yy,zz=center
        mesh('Banner_heraldic_diamond',[(xx-size*.10,yy-.001,zz),(xx,yy-.001,zz+size*.15),
             (xx+size*.10,yy-.001,zz),(xx,yy-.001,zz-size*.15)],[(0,1,2,3)],linen)

    def masonry(cx,cy,z,w,h,rotation=0,depth=.005,course=.020):
        # Individual uneven fronts and recessed joints, batched into one mesh.
        verts=[]; faces=[]; rows=max(1,round(h/course)); rh=h/rows
        for row in range(rows):
            columns=max(2,round(w/(rh*1.9))); cw=w/columns
            for col in range(columns+1):
                left=max(-w/2,-w/2+(col-(row%2)*.5)*cw); right=min(w/2,-w/2+(col+1-(row%2)*.5)*cw)
                if right-left<.002:continue
                if col: left+=rng.uniform(-.002,.002)
                left+=.001; right-=.001
                bottom=z+row*rh+.0007; top=z+(row+1)*rh-.0007
                bulge=depth+rng.uniform(-.001,.001)
                local=[(left,0,bottom),(right,0,bottom),(right,0,top),(left,0,top),
                       (left,bulge,bottom+.001),(right,bulge,bottom+.001),(right,bulge,top-.001),(left,bulge,top-.001)]
                k=len(verts)
                for x,y,zz in local: verts.append((cx+x*math.cos(rotation)-y*math.sin(rotation),cy+x*math.sin(rotation)+y*math.cos(rotation),zz))
                faces.extend(tuple(k+i for i in f) for f in [(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)])
        mesh('Irregular_masonry_courses',verts,faces,stone)

    def roof(x,y,z,w,d,h,rows=10,columns=10):
        mesh('Timbered_gable',[(x-w/2,y-d/2,z),(x+w/2,y-d/2,z),(x,y-d/2,z+h),
             (x-w/2,y+d/2,z),(x+w/2,y+d/2,z),(x,y+d/2,z+h)],
             [(0,2,1),(3,4,5),(0,3,5,2),(2,5,4,1)],plaster)
        verts=[]; faces=[]
        for side in [-1,1]:
            for row in range(rows):
                a=row/rows; b=min(1,(row+1.18)/rows)
                for col in range(columns+1):
                    lo=max(-d/2,-d/2+(col-(row%2)*.5)*d/columns)+.0006
                    hi=min(d/2,-d/2+(col+1-(row%2)*.5)*d/columns)-.0006
                    if hi-lo<.001:continue
                    lift=rng.uniform(.0018,.0036)
                    points=[(x+side*w/2*(1-a),y+lo,z+h*a+lift),
                            (x+side*w/2*(1-a),y+hi,z+h*a+lift),
                            (x+side*w/2*(1-b),y+hi,z+h*b+.002),
                            (x+side*w/2*(1-b),y+lo,z+h*b+.002)]
                    k=len(verts); verts.extend(points)
                    verts.extend([(points[0][0],points[0][1],points[0][2]-.0025),
                                  (points[1][0],points[1][1],points[1][2]-.0025)])
                    faces.extend([(k,k+1,k+2,k+3),(k+4,k+5,k+1,k)])
        obj=mesh('Overlapping_split_wood_shingles',verts,faces,shingles)
        # Roof sheets are thin: render both sides at steep viewing angles.
        shingles.use_backface_culling=False
        for yy in [y-d/2,y+d/2]:
            beam('Carved_bargeboard',(x-w/2,yy,z),(x,yy,z+h+.004),.0045,wood)
            beam('Carved_bargeboard',(x+w/2,yy,z),(x,yy,z+h+.004),.0045,wood)
            beam('Gable_kingpost',(x,yy-.001,z),(x,yy-.001,z+h),.004,wood)
            for side in [-1,1]:
                beam('Gable_fan_brace',(x+side*w*.28,yy,z+.007),(x,yy,z+h*.70),.0028,wood)
                beam('Gable_short_stud',(x+side*w*.22,yy,z),(x+side*w*.22,yy,z+h*.52),.0028,wood)
        beam('Weathered_ridge',(x,y-d/2-.008,z+h),(x,y+d/2+.008,z+h),.005,wood)

    def window(x,y,z,w=.032,h=.044):
        cube('Deep_window_reveal',(x,y,z),(w+.008,.004,h+.008),wood)
        cube('Dark_glazing',(x,y-.003,z),(w,.002,h),glass)
        for xx in [-w/2,0,w/2]: cube('Window_frame',(x+xx,y-.005,z),(.0028,.004,h+.004),wood)
        for zz in [-h/2,0,h/2]: cube('Window_transom',(x,y-.005,z+zz),(w+.004,.004,.0028),wood)
        cube('Stone_sill',(x,y-.007,z-h/2-.004),(w+.014,.013,.005),stone,.001)
        for sign in [-1,1]:
            cube('Open_shutter',(x+sign*(w*.74),y-.007,z),(w*.35,.004,h),wood)

    def door(x,y,z,w=.040,h=.071):
        cube('Doorway_shadow',(x,y,z+h/2),(w+.008,.005,h+.003),iron)
        for i in range(5): cube('Oak_door_plank',(x+(i-2)*w/5,y-.004,z+h/2),(w/5-.0007,.003,h),wood)
        for zz in [.018,h-.018]: cube('Forged_hinge',(x,y-.007,z+zz),(w*.8,.002,.003),metal)
        for side in [-1,1]: cube('Door_jamb',(x+side*(w/2+.004),y-.003,z+h/2),(.008,.012,h+.01),wood)
        cube('Carved_lintel',(x,y-.004,z+h+.006),(w+.02,.014,.012),wood)
        beam('Iron_door_handle',(x+w*.25,y-.009,z+h*.47),(x+w*.25,y-.009,z+h*.56),.002,metal)

    def house(x,y,z,w=.21,d=.23,h=.22,detail=True):
        base=h*.43
        cube('Mortared_stone_ground_floor',(x,y,z+base/2),(w,d,base),stone)
        for yy,rot in [(y-d/2,math.pi),(y+d/2,0)]: masonry(x,yy,z,w,base,rot,course=.017)
        for xx,rot in [(x-w/2,math.pi/2),(x+w/2,-math.pi/2)]: masonry(xx,y,z,d,base,rot,course=.017)
        cube('Overhanging_lime_upper_floor',(x,y,z+base+(h-base)/2),(w+.009,d+.009,h-base),plaster)
        for xx in [-w/2,0,w/2]:
            for sy in [-1,1]: cube('Upper_oak_post',(x+xx,y+sy*(d/2+.007),z+base+(h-base)/2),(.007,.009,h-base+.005),wood)
        for sy in [-1,1]:
            yy=y+sy*(d/2+.008)
            for zz in [base,h]: cube('Oak_bressumer',(x,yy,z+zz),(w+.025,.012,.009),wood)
            for sx in [-1,1]:
                beam('Diagonal_timber_brace',(x+sx*w*.45,yy,z+base+.015),(x+sx*w*.12,yy,z+h-.014),.0034,wood)
        for sx in [-1,1]:
            xx=x+sx*(w/2+.009)
            for yy in [-d/2,0,d/2]: cube('Side_oak_post',(xx,y+yy,z+base+(h-base)/2),(.009,.007,h-base),wood)
            beam('Side_diagonal_brace',(xx,y-d*.4,z+base+.01),(xx,y-.008,z+h-.01),.004,wood)
            beam('Side_diagonal_brace',(xx,y+d*.4,z+base+.01),(xx,y+.008,z+h-.01),.004,wood)
        door(x,y-d/2-.007,z,.037 if w<.16 else .046,base*.91)
        if detail:
            for xx in [-w*.32,w*.32]:window(x+xx,y-d/2-.009,z+base*.6,.025,base*.48)
        window(x,y-d/2-.014,z+base+(h-base)*.54,w*.19,(h-base)*.50)
        if detail:
            for side in [-1,1]:
                start=len(api['parts'])
                window(x,y-w/2-.013,z+base+(h-base)*.53,.033,(h-base)*.49)
                for obj in api['parts'][start:]:
                    dx,dy=obj.location.x-x,obj.location.y-y
                    obj.location.x=x-side*dy;obj.location.y=y+side*dx;obj.rotation_euler.z=side*math.pi/2
        roof(x,y,z+h,w+.045,d+.035,h*.62,10 if detail else 7,10 if detail else 7)
        if detail:
            # Small front porch, carved supports, stone steps, and dormer.
            roof(x,y-d/2-.025,z+base+.026,w*.45,.085,.040,4,4)
            for sx in [-1,1]: beam('Porch_post',(x+sx*w*.20,y-d/2-.062,z),(x+sx*w*.20,y-d/2-.062,z+base+.023),.0045,wood)
            for step in range(3):cube('Worn_entry_step',(x,y-d/2-.025-step*.015,z+.005-step*.002),(.075,.036,.011),stone,.0015)
            cube('Dormer_cheeks',(x+w*.28,y+.025,z+h+.068),(.063,.060,.052),plaster)
            roof(x+w*.28,y+.025,z+h+.094,.077,.074,.042,5,4)
            window(x+w*.28,y-.007,z+h+.075,.025,.028)
        chimney=(x-w*.28,y+d*.23,z+h+h*.62+.037)
        ch=.105
        cube('Chimney_mortar',(chimney[0],chimney[1],chimney[2]-ch/2),(.032,.036,ch),stone)
        for yy,rot in [(chimney[1]-.018,math.pi),(chimney[1]+.018,0)]: masonry(chimney[0],yy,chimney[2]-ch,.032,ch,rot,course=.014)
        cube('Chimney_soot_opening',(chimney[0],chimney[1],chimney[2]+.001),(.024,.028,.003),iron)
        for side in [-1,1]:
            cube('Chimney_rim',(chimney[0]+side*.018,chimney[1],chimney[2]),(.006,.043,.009),stone)
            cube('Chimney_rim',(chimney[0],chimney[1]+side*.020,chimney[2]),(.031,.006,.009),stone)
        api.setdefault('emitters',[]).append(chimney)

    def slab(name,x,y,z,rx,ry,material=stone,n=6,thickness=.009):
        ring=[(x+math.cos(i/n*math.tau)*rx*rng.uniform(.85,1.10),y+math.sin(i/n*math.tau)*ry*rng.uniform(.85,1.10)) for i in range(n)]
        points=[(xx,yy,z) for xx,yy in ring]+[(xx,yy,z+thickness+rng.uniform(-.0007,.0007)) for xx,yy in ring]
        return mesh(name,points,[tuple(range(n,2*n))]+[(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)],material)

    def settlement():
        slab('Weathered_building_foundation',0,0,.010,.159,.171,n=10)
        house(0,0,.022)
        barrel(.13,.065,.025)
        for i in range(5): beam('Stacked_firewood',(.13,-.02,.033+i%2*.012),(.13,.035,.033+i%2*.012),.008,wood,7)
        flag(-.13,-.10,.26)

    def wall(a,b,z=.018,height=.10):
        mid=(Vector(a)+Vector(b))/2; length=(Vector(b)-Vector(a)).length; angle=math.atan2(b[1]-a[1],b[0]-a[0])
        obj=cube('Curtain_wall',(mid.x,mid.y,z+height/2),(length,.024,height),stone);obj.rotation_euler.z=angle
        masonry(mid.x-math.sin(angle)*.013,mid.y+math.cos(angle)*.013,z,length,height,angle,course=.019)
        for i in range(max(2,round(length/.030))):
            t=(i+.5)/max(2,round(length/.030));xx=a[0]+(b[0]-a[0])*t; yy=a[1]+(b[1]-a[1])*t
            obj=cube('Wall_merlon',(xx,yy,z+height+.01),(.016,.029,.023),stone,.001);obj.rotation_euler.z=angle

    def city():
        slab('Walled_city_rock_footing',0,0,.004,.273,.273,n=16)
        # Four physically open, arched gateways, with roads into the courtyard.
        for side in range(4):
            angle=side*math.pi/2; ca,sa=math.cos(angle),math.sin(angle)
            def p(x,y): return (x*ca-y*sa,x*sa+y*ca)
            wall(p(-.19,.19),p(-.043,.19));wall(p(.043,.19),p(.19,.19))
            for sx in [-1,1]:
                xx,yy=p(sx*.048,.19);cube('Gate_pier',(xx,yy,.069),(.020,.035,.104),stone)
            # Radial voussoirs leave a real hole below the arch.
            for j in range(9):
                a=j*math.pi/9; b=(j+1)*math.pi/9
                vv=[]
                for depth in [-.016,.016]:
                    for rr,theta in [(.039,a),(.054,a),(.054,b),(.039,b)]:
                        xx,yy=p(math.cos(theta)*rr,.19+depth);vv.append((xx,yy,.080+math.sin(theta)*rr))
                mesh('Gate_arch_stone',vv,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3)],stone)
            for step in range(5):
                xx,yy=p(0,.16-step*.045);slab('Courtyard_flagstone',xx,yy,.020,.025,.023)
        for xx in [-.19,.19]:
            for yy in [-.19,.19]:
                beam('Round_corner_tower',(xx,yy,.016),(xx,yy,.166),.039,stone,12)
                beam('Tower_coping',(xx,yy,.156),(xx,yy,.173),.045,stone,12)
                for j in range(8):
                    a=j*math.tau/8;cube('Tower_crenel',(xx+math.cos(a)*.036,yy+math.sin(a)*.036,.187),(.015,.015,.025),stone)
                cube('Tower_arrow_slit',(xx,yy-.039,.112),(.006,.002,.027),iron)
        house(-.080,.050,.024,.13,.14,.18,False)
        house(.084,.074,.024,.115,.13,.145,False)
        house(.081,-.098,.024,.10,.105,.12,False)
        # Market stall, well, barrels and a tall central watchtower.
        for xx in [-.10,-.045]:beam('Market_post',(xx,-.10,.025),(xx,-.10,.095),.0035,wood)
        cube('Market_counter',(-.073,-.10,.055),(.065,.041,.035),wood)
        mesh('Market_canvas',[(-.11,-.13,.105),(-.035,-.13,.105),(-.035,-.07,.118),(-.11,-.07,.118)],[(0,1,2,3),(3,2,1,0)],linen)
        beam('Well_stone_ring',(-.018,-.027,.022),(-.018,-.027,.050),.019,stone,12)
        beam('Keep',(0,.115,.028),(0,.115,.29),.038,stone,8)
        roof(0,.115,.29,.087,.087,.080,6,6)
        flag(0,.115,.37)
        barrel(-.15,.00,.023)

    def road():
        # Irregular slabs, offset joints, earth showing between stones; no rails.
        for row in range(3):
            for col in range(15):
                x=-.47+col*.067+(row%2)*.016
                if x>.49:continue
                slab('Uneven_ancient_paving',x,(row-1)*.032+rng.uniform(-.003,.003),.002+rng.uniform(-.001,.001),.034,.019,api['paving'],n=5+rng.randrange(3),thickness=.006)
        for i in range(25):
            x=rng.uniform(-.48,.48);y=rng.choice([-1,1])*rng.uniform(.044,.060)
            slab('Moss_in_road_margin',x,y,.001,.009,.007,moss,5,thickness=.001)
            if i%3==0:
                mesh('Grass_between_slabs',[(x-.006,y,.012),(x+.005,y,.012),(x+.002,y+.003,.027)],[(0,1,2),(2,1,0)],moss)
        for x,y in [(-.39,.067),(.39,-.067)]:
            beam('Route_boundary_stake',(x,y,.003),(x,y,.062),.004,wood)
            cube('Player_route_marker',(x,y,.049),(.018,.007,.014),tint)
        # Low, irregular colored kerbstones make the whole route readable.
        # Preserve the random stream used by the subsequent neutral assets.
        state=rng.getstate()
        for side in [-1,1]:
            for i in range(20):
                slab('Player_road_border',-.475+i*.05,side*.063,.002,.025,.010,
                     api['owner_trim'],n=6,thickness=.012)
        rng.setstate(state)

    def barrel(x,y,z,scale=1):
        ring=[(.022,0),(.025,.01),(.028,.03),(.025,.05),(.022,.06)]; vv=[]; ff=[]
        for rr,zz in ring:
            for i in range(12):vv.append((x+math.cos(i*math.tau/12)*rr*scale,y+math.sin(i*math.tau/12)*rr*scale,z+zz*scale))
        for row in range(4):
            for i in range(12):a=row*12+i;b=row*12+(i+1)%12;ff.append((a,b,b+12,a+12))
        ff.append(tuple(range(48,60)));mesh('Bulging_oak_barrel',vv,ff,wood)
        for zz in [.012,.048]:
            for i in range(12):
                a=i*math.tau/12;b=(i+1)*math.tau/12
                beam('Barrel_iron_band',(x+math.cos(a)*.026*scale,y+math.sin(a)*.026*scale,z+zz*scale),
                     (x+math.cos(b)*.026*scale,y+math.sin(b)*.026*scale,z+zz*scale),.0016*scale,metal,4)

    def crate(x,y,z,s=.055):
        cube('Slatted_cargo_box',(x,y,z+s/2),(s,s,s),wood)
        for sx in [-1,1]:
            for sy in [-1,1]:cube('Crate_corner',(x+sx*s*.44,y+sy*s*.44,z+s/2),(.005,.005,s+.004),wood)
        beam('Crate_diagonal',(x-s*.42,y-s*.51,z+.005),(x+s*.42,y-s*.51,z+s-.005),.003,wood,4)

    def square_sail(bx,by,z,w,h):
        vv=[]; ff=[]; nx,ny=6,5
        for row in range(ny+1):
            v=row/ny
            for col in range(nx+1):
                u=col/nx; belly=math.sin(u*math.pi)*math.sin(v*math.pi)*.028
                vv.append((bx+(u-.5)*w*(1-.15*v),by-belly,z+v*h))
        for row in range(ny):
            for col in range(nx):a=row*(nx+1)+col;ff.append((a,a+1,a+nx+2,a+nx+1))
        sail=mesh('Wind_filled_canvas',vv,ff,linen)
        for face in sail.data.polygons:face.use_smooth=True
        for col in range(0,nx+1,2):
            for row in range(ny):
                a=vv[row*(nx+1)+col];b=vv[(row+1)*(nx+1)+col]
                beam('Canvas_panel_seam',a,b,.00065,wood,4)
        beam('Sail_lower_bolt_rope',vv[0],vv[nx],.0012,wood,4)
        beam('Square_sail_yard',(bx-w*.55,by,z+h),(bx+w*.55,by,z+h),.0035,wood)

    def ship():
        bx,by=.39,-.48
        # Ten-sided plank hull with several sheer lines and a raised stern.
        outline=[(-.068,-.25),(-.098,-.16),(-.101,.06),(-.068,.23),(0,.34),(.068,.23),(.101,.06),(.098,-.16),(.068,-.25),(0,-.27)]
        vv=[];ff=[]
        for rr,zz in [(.38,-.15),(.78,-.115),(1,-.025),(1.025,.014)]:
            for xx,yy in outline: vv.append((bx+xx*rr,by+yy*rr,zz+.030*(abs(yy)/.34)**2))
        for row in range(3):
            for i in range(10):a=row*10+i;b=row*10+(i+1)%10;ff.append((a,b,b+10,a+10))
        mesh('Carvel_built_hull',vv,ff,wood)
        mesh('Ship_deck',[(bx+xx*.96,by+yy*.96,.007) for xx,yy in outline],[tuple(range(10))],shingles)
        for i in range(10):
            xx,yy=outline[i];xx2,yy2=outline[(i+1)%10]
            for h in [.035,-.050]:beam('Hull_wales',(bx+xx,by+yy,h),(bx+xx2,by+yy2,h),.0035,metal,5)
            beam('Ship_rail_post',(bx+xx,by+yy,.025),(bx+xx,by+yy,.071),.0025,wood)
            beam('Ship_rail',(bx+xx,by+yy,.071),(bx+xx2,by+yy2,.071),.003,wood)
        cube('Stern_cabin',(bx,by-.17,.045),(.12,.11,.070),wood)
        for xx in [-.040,0,.040]: window(bx+xx,by-.228,.05,.021,.026)
        cube('Cabin_roof',(bx,by-.17,.085),(.14,.13,.012),shingles)
        cube('Deck_hatch',(bx,by+.055,.022),(.060,.055,.025),wood)
        beam('Bowsprit',(bx,by+.26,.025),(bx,by+.46,.13),.0035,wood)
        for yy,height,width in [(by+.13,.63,.25),(by-.105,.51,.23)]:
            beam('Ship_mast',(bx,yy,-.015),(bx,yy,height),.0048,wood,8)
            for z,w,h in [(.12,width,.19),(.34,width*.73,.13)]:
                if height<.6:z-=.045
                square_sail(bx,yy,z,w,h)
            for side in [-1,1]:
                for offset in [-.075,.075]:beam('Standing_rigging',(bx+side*.091,yy+offset,.04),(bx,yy,height-.02),.0011,iron,4)
                for rung in range(6):
                    t=(rung+1)/9;beam('Ratline',(bx+side*.091*(1-t),yy-.075*(1-t),.04+(height-.06)*t),
                                                    (bx+side*.091*(1-t),yy+.075*(1-t),.04+(height-.06)*t),.0007,wood,4)
            beam('Mast_pennant_staff',(bx,yy,height),(bx,yy,height+.02),.002,wood)
            mesh('Merchant_pennant',[(bx,yy,height),(bx+.058,yy-.015,height-.012),(bx,yy,height-.030)],[(0,1,2),(2,1,0)],linen)
        mesh('Flying_jib',[(bx,by+.14,.58),(bx,by+.45,.14),(bx+.022,by+.17,.15)],[(0,1,2),(2,1,0)],linen)
        beam('Forestay',(bx,by+.13,.63),(bx,by+.46,.13),.0012,iron,4)
        mesh('Aft_spanker',[(bx,by-.12,.45),(bx,by-.27,.28),(bx+.018,by-.25,.10),(bx,by-.12,.10)],[(0,1,2,3),(3,2,1,0)],linen)
        beam('Spanker_boom',(bx,by-.12,.10),(bx,by-.29,.10),.003,wood)
        for yy in [by-.18,by+.18]: beam('Mooring_line',(.15,yy,.13),(bx-.085,yy,.043),.0018,wood,5)

    def port():
        cube('Stone_quay_core',(0,-.12,.005),(.31,.32,.18),stone)
        masonry(0,-.28,-.08,.31,.18,math.pi,course=.025)
        for side in [-1,1]:masonry(side*.155,-.12,-.08,.32,.18,-side*math.pi/2,course=.025)
        for i in range(12):cube('Aged_dock_plank',(0,-.30-i*.039,.103),(.31,.035,.022),wood,.001)
        for side in [-1,1]:
            for yy in [-.29,-.49,-.72]:
                beam('Driven_oak_pile',(side*.13,yy,-.24),(side*.13,yy,.15),.014,wood,8)
                beam('Pile_iron_cap',(side*.13,yy,.14),(side*.13,yy,.152),.015,metal,8)
            beam('Pier_diagonal_brace',(side*.13,-.29,-.10),(side*.13,-.55,.075),.010,wood)
        # Roofed warehouse at the shore, with open aisle for the cargo display.
        cube('Warehouse_stone_base',(-.072,-.026,.133),(.14,.14,.070),stone)
        cube('Warehouse_plaster',(-.072,-.026,.205),(.14,.14,.08),plaster)
        for xx in [-.14,-.005]:beam('Warehouse_timber',(xx,-.10,.10),(xx,-.10,.246),.0045,wood)
        beam('Warehouse_brace',(-.13,-.102,.175),(-.015,-.102,.243),.0035,wood)
        door(-.072,-.099,.107,.055,.072)
        roof(-.072,-.026,.246,.17,.17,.083,7,7)
        barrel(-.09,-.66,.115);crate(.085,-.64,.115,.056)
        crate(-.09,-.57,.115,.049)
        # Trading information is displayed by a camera-facing UI tag.
        # Small dock crane and hanging hook.
        beam('Cargo_crane_post',(-.12,-.45,.11),(-.12,-.45,.37),.008,wood)
        beam('Cargo_crane_jib',(-.12,-.45,.35),(.025,-.47,.34),.007,wood)
        beam('Crane_diagonal',(-.12,-.45,.23),(-.005,-.47,.34),.005,wood)
        beam('Hoist_rope',(.018,-.47,.34),(.018,-.47,.20),.0018,iron,5)
        ship()

    def robber():
        start=len(api['parts'])
        slab('Robber_rock_base',0,0,.002,.069,.056,stone,9)
        # Separate boots, legs, tunic, leather armor, arms and articulated hands.
        for side in [-1,1]:
            x=side*.027
            ellipsoid('Worn_boot',(x,-.009,.031),(.019,.030,.026),iron)
            beam('Trouser_leg',(x,0,.044),(side*.022,.007,.135),.019,iron,10)
            for zz in [.058,.074]:beam('Boot_lacing',(x-.012,-.024,zz),(x+.012,-.024,zz+.003),.0015,wood,4)
        ellipsoid('Quilted_leather_tunic',(0,.004,.168),(.047,.032,.066),leather,16,10)
        ellipsoid('Shoulder_armor',(0,.003,.220),(.057,.030,.025),metal)
        for side in [-1,1]:
            shoulder=(side*.050,0,.216);elbow=(side*.070,-.002,.178);hand=(side*.065,-.024,.143)
            beam('Sleeved_upper_arm',shoulder,elbow,.017,iron,10)
            beam('Leather_bracer',elbow,hand,.012,leather,10)
            ellipsoid('Gloved_hand',hand,(.012,.010,.016),iron)
        cube('Traveler_belt',(0,-.029,.159),(.087,.009,.014),wood)
        cube('Belt_buckle',(0,-.036,.160),(.017,.005,.016),metal)
        cube('Buckle_inset',(0,-.039,.160),(.010,.002,.009),iron)
        beam('Diagonal_leather_strap',(-.038,-.029,.216),(.025,-.034,.153),.0045,wood,5)
        for side in [-1,1]:ellipsoid('Belt_pouch',(side*.049,-.010,.142),(.017,.014,.022),wood)
        # Broad, open-front hood and cape: the opening is actual geometry.
        vv=[];ff=[];segments=20;levels=7
        for row in range(levels):
            t=row/(levels-1);z=.047+t*.190;radius=.080*(1-t)+.051*t
            for i in range(segments+1):
                a=-.35+i/segments*(math.pi+.70)
                r=radius*(1+.070*math.sin(i*2.1+t*2))
                vv.append((math.cos(a)*r,math.sin(a)*r+.010,z+.006*math.sin(i*.7)*(1-t)))
        for row in range(levels-1):
            for i in range(segments):a=row*(segments+1)+i;ff.append((a,a+1,a+segments+2,a+segments+1))
        cloak=mesh('Deeply_folded_open_cloak',vv,ff,iron)
        for poly in cloak.data.polygons:poly.use_smooth=True
        lining=[(x*.98,y-.001,z+.001) for x,y,z in vv];mesh('Oxblood_cloak_lining',lining,[tuple(reversed(f)) for f in ff],leather)
        ellipsoid('Shadowed_face',(0,-.004,.263),(.017,.017,.025),wood,16,10)
        ellipsoid('Lower_face_scarf',(0,-.010,.252),(.021,.019,.012),leather,16,8)
        # Hood consists of a swept rim and back shell, not a ball with painted face.
        vv=[];ff=[]
        for row in range(6):
            t=row/5
            for i in range(17):
                a=i/16*math.pi
                vv.append((math.cos(a)*.032*(1-t*.45),-.026+t*.063,.247+math.sin(a)*.046*(1-t*.35)))
        for row in range(5):
            for i in range(16):a=row*17+i;ff.append((a,a+1,a+18,a+17))
        hood=mesh('Sculpted_open_hood',vv,ff,iron)
        for face in hood.data.polygons:face.use_smooth=True
        for i in range(16):beam('Hood_sewn_edge',vv[i],vv[i+1],.0025,leather,5)
        for x in [-.007,.007]:ellipsoid('Eyes_under_hood',(x,-.021,.270),(.0009,.0006,.0006),stone,8,4)
        for i in range(7):
            xx=(i-3)*.010
            beam('Tunic_sewn_panel',(xx,-.028,.118),(xx*.8,-.031,.199),.0010,wood,4)
        for side in [-1,1]:
            for layer in range(3):
                plate=ellipsoid('Layered_pauldron',(side*(.044+layer*.004),0,.223-layer*.009),(.016,.028,.007),metal)
            ellipsoid('Cloak_brooch',(side*.039,-.023,.225),(.005,.003,.005),stone,10,6)
        beam('Dagger_scabbard',(.041,-.017,.153),(.062,-.019,.076),.006,iron,6)
        beam('Dagger_hilt',(.038,-.017,.162),(.033,-.017,.181),.004,wood)
        beam('Dagger_guard',(.024,-.017,.163),(.051,-.017,.163),.0025,metal)
        # Adult proportions: lengthen the legs while keeping the hood small.
        bpy.context.view_layer.update()
        from mathutils import Matrix
        for obj in api['parts'][start:]:
            transform=obj.matrix_world.copy()
            for vert in obj.data.vertices:
                p=transform@vert.co
                if p.z>.04:p.z+=min(p.z-.04,.10)*.50
                vert.co=p
            obj.matrix_world=Matrix.Identity(4)

    def cargo():
        # One GLB with named resource subtrees; only the matching cargo is drawn.
        for kind in ['Timber','Clay','Wool','Grain','Stone','General']:
            start=len(api['parts'])
            if kind=='Timber':
                for row in range(3):
                    for col in range(3-row):
                        xx=(col-(2-row)/2)*.032
                        beam('Export_log',(xx,-.06,.02+row*.029),(xx,.065,.02+row*.029),.018,wood,9)
                        beam('Visible_log_end',(xx,-.0605,.02+row*.029),(xx,-.062,.02+row*.029),.014,shingles,9)
                for yy in [-.034,.035]:beam('Log_binding',(-.056,yy,.035),(.056,yy,.035),.002,iron)
            elif kind in ['Stone','Clay']:
                for i in range(10):
                    obj=ellipsoid('Stone_cargo' if kind=='Stone' else 'Fired_clay_cargo',
                                  (rng.uniform(-.050,.050),rng.uniform(-.04,.04),.018+(i//5)*.030),
                                  (.025,.024,.018),stone if kind=='Stone' else leather,8,5)
                    for v in obj.data.vertices:v.co*=rng.uniform(.87,1.12)
                    for f in obj.data.polygons:f.use_smooth=False
            elif kind=='Wool':
                ellipsoid('Sheep_continuous_fleece',(0,0,.072),(.046,.071,.037),linen,20,12)
                ellipsoid('Sheep_head',(0,-.073,.090),(.019,.026,.024),iron)
                for xx in [-.027,.027]:
                    for yy in [-.043,.043]:beam('Sheep_leg',(xx,yy,.01),(xx,yy,.059),.0065,iron,7)
                for xx in [-.023,.023]:ellipsoid('Sheep_ear',(xx,-.070,.103),(.017,.008,.005),linen)
                for side in [-1,1]:
                    for yy in [-.075,.075]:beam('Sheep_pen_post',(side*.071,yy,0),(side*.071,yy,.068),.004,wood)
                    beam('Sheep_pen_rail',(side*.071,-.075,.048),(side*.071,.075,.048),.003,wood)
            elif kind=='Grain':
                for xx,yy in [(-.027,-.02),(.028,.018)]:
                    ellipsoid('Hessian_grain_sack',(xx,yy,.037),(.028,.030,.039),linen)
                    beam('Sack_tied_neck',(xx,yy,.068),(xx,yy,.083),.009,wood,7)
                for i in range(12):
                    xx=rng.uniform(-.020,.020);yy=.046+rng.uniform(-.015,.015)
                    beam('Wheat_stalk',(xx,yy,.01),(xx+.01,yy,.105),.0015,shingles,4)
                    ellipsoid('Ripe_wheat_ear',(xx+.01,yy,.106),(.004,.004,.013),shingles,8,5)
            else:
                crate(-.025,-.015,0,.064);barrel(.038,.02,0,.8)
            objects=api['parts'][start:];bpy.ops.object.select_all(action='DESELECT')
            for obj in objects:obj.select_set(True)
            bpy.context.view_layer.objects.active=objects[0];bpy.ops.object.join();obj=bpy.context.object
            bpy.ops.object.transform_apply(location=True,rotation=True,scale=True)
            obj.name='Cargo_'+kind;obj['cargoType']=kind
            api['parts'][start:]=[obj]

    return {'Settlement':settlement,'City':city,'Road':road,'Port':port,'Robber':robber,'Cargo':cargo}
