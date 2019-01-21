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
player.image = 'example.com/sprite2.png';
```

This library does layer-based rendering. You can change an object's *layer* value asynchronously. You can access layers and settings in the *layer* scope. 

You can enable WebGL for layers individually for the purpose of speed. It will draw objects as cubes.

```javascript
game.layers[0].use_webgl = true;

// Automatically switched to WebGL-mode
```
