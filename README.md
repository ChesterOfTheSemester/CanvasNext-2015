# CanvasNext-2015
A 2D/WebGL enabled rendering library I worked on between 2015 and 2016

Firstly instantiate a CanvasNext (CN) object:

```javascript
var game = new CanvasNext({
    canvas : document.getElementById('canvas'),
    context : '2d',
    width: 900,
    height: 700,
    fps_cap : 300
});
```

Next, you can add objects. They're like rectangles:

```javascript
var player = game.add_obj({
    layer : 1,
    x : 0,
    y : 0,
    width : 32,
    height : 32,
    image : 'example.com/sprite.png',
    rotate : 0
});
```

The library is asynchronous. If you change the object values they will react automatically:

```javascript
player.x += 10;
player.opacity = 0.5;
player.image = 'example.com/sprite2.png';
player.layer = 2;
```

This library does layer-based rendering. You can change an object's *layer* value asynchronously. You can access layers and settings in the *layer* scope. 

You can enable WebGL for layers individually for the purpose of speed. Think of them as particle-containers or simply layers with many movable objects. It will draw objects as cubes.

```javascript
game.layers[0].use_webgl = true;
// Automatically switched to WebGL-mode
```

For when WebGL is enabled, you can add additional fragment-shader code for layers indivudually. CN recompiles the shader on change.

```GLSL
// Grayscale everything
game.layers[0].fragmentShader = `
    float L = 0.34 * gl_FragColor.x + 0.5 * gl_FragColor.y + 0.16 * gl_FragColor.z;
    gl_FragColor.xyz = L;
`;
```
