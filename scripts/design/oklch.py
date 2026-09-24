import math

def srgb_to_linear(c):
    c = c/255.0
    if c <= 0.04045:
        return c/12.92
    return ((c+0.055)/1.055)**2.4

def linear_to_srgb(c):
    if c <= 0.0031308:
        v = c*12.92
    else:
        v = 1.055*(c**(1/2.4)) - 0.055
    return max(0,min(255, round(v*255)))

def rgb_to_oklab(r,g,b):
    r,g,b = srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b)
    l = 0.4122214708*r + 0.5363325363*g + 0.0514459929*b
    m = 0.2119034982*r + 0.6806995451*g + 0.1073969566*b
    s = 0.0883024619*r + 0.2817188376*g + 0.6299787005*b
    l_, m_, s_ = l**(1/3), m**(1/3), s**(1/3)
    L = 0.2104542553*l_ + 0.7936177850*m_ - 0.0040720468*s_
    A = 1.9779984951*l_ - 2.4285922050*m_ + 0.4505937099*s_
    B = 0.0259040371*l_ + 0.7827717662*m_ - 0.8086757660*s_
    return L,A,B

def oklab_to_rgb(L,A,B):
    l_ = L + 0.3963377774*A + 0.2158037573*B
    m_ = L - 0.1055613458*A - 0.0638541728*B
    s_ = L - 0.0894841775*A - 1.2914855480*B
    l, m, s = l_**3, m_**3, s_**3
    r = +4.0767416621*l - 3.3077115913*m + 0.2309699292*s
    g = -1.2684380046*l + 2.6097574011*m - 0.3413193965*s
    b = -0.0041960863*l - 0.7034186147*m + 1.7076147010*s
    return linear_to_srgb(r), linear_to_srgb(g), linear_to_srgb(b)

def rgb_to_oklch(r,g,b):
    L,A,B = rgb_to_oklab(r,g,b)
    C = math.hypot(A,B)
    H = math.degrees(math.atan2(B,A)) % 360
    return L,C,H

def oklch_to_rgb(L,C,H):
    hr = math.radians(H)
    A = C*math.cos(hr)
    B = C*math.sin(hr)
    return oklab_to_rgb(L,A,B)

def hex_to_rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i+2],16) for i in (0,2,4))

def rgb_to_hex(rgb):
    return '#%02X%02X%02X' % rgb

def rel_luminance(rgb):
    r,g,b = [srgb_to_linear(c) for c in rgb]
    return 0.2126*r + 0.7152*g + 0.0722*b

def contrast(rgb1, rgb2):
    l1, l2 = rel_luminance(rgb1), rel_luminance(rgb2)
    l1,l2 = max(l1,l2), min(l1,l2)
    return (l1+0.05)/(l2+0.05)
