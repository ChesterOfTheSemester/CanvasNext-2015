/**
 *   Top-level CanvasNext API
 *   ES6 required
 *
 *   2016 by Chester Abrahams
 *   IN: https://www.linkedin.com/in/chesterabrahams/
 */

var CanvasNext = function(opt)
{
    'use strict';

    var API = this.initialize(opt);
    this.callback();

    return API;
};

CanvasNext.prototype.initialize = function(opt)
{
    for ( var i in opt ) this[i] = opt[i];

    var CN = this;

    this.STORE = opt;
    {
        this.STORE.ctx = this.STORE.canvas.getContext(this.STORE.context || '2d');

        // Layer list
        this.STORE.layer = this.layers = [];

        /**
         * Media cache objects
         *
         * {'URLSource' : HTMLElement}
         */
        {
            this.STORE.image_cache = {};
            this.STORE.image_cache.atlas = {};
            this.STORE.audio_cache = {};

            // Create atlas for WebGL texturing
            this.STORE.image_cache.canvas = document.createElement('canvas');
            this.STORE.image_cache.canvas.width = this.STORE.image_cache.canvas.height = 10;
            this.STORE.image_cache.ctx = this.STORE.image_cache.canvas.getContext('2d');
            this.STORE.image_cache.tmpCanvas = document.createElement('img');
            this.STORE.image_cache.tmpCanvas.width = this.STORE.image_cache.tmpCanvas.height = 10;
        }

        /**
         * Camera system
         */
        {
            this.STORE.camera = {
                x : 0,
                y : 0,
                z : 1,
                rotate : 0
            };

            this.camera = new Proxy(this.STORE.camera,
                {
                    set : function(obj, key, value)
                    {
                        if ( obj[key] === value ) return;
                        CN.glRefresh();

                        if ( key == 'x' || key === 'y' ) value = parseFloat(value.toFixed(0));;

                        obj[key] = value;
                    }
                });
        }

        /**
         *  Track the mouse position
         *  [ X, Y ] || @obj mouse.{ x, y }
         */
        {
            CN.mouse_position = [0, 0];
            CN.mouse = {};
            this.STORE.canvas.onmousemove = function(e)
            {
                CN.mouse_position = [ e.pageX - CN.STORE.canvas.offsetLeft, e.pageY - CN.STORE.canvas.offsetTop ];

                CN.mouse.x = CN.mouse_position[0];
                CN.mouse.y = CN.mouse_position[1];

                CN.glRefresh();
            };
        }
    }

    /**
     * Prefix callback system
     * @fps_cap (<int>|*)
     */
    this.STORE.fps_cap = (function(value)
    {
        if ( value === 0 ) return 0;

        return Math.abs(value) || (window.requestAnimationFrame = window.requestAnimationFrame
            || window.mozRequestAnimationFrame
            || window.webkitRequestAnimationFrame
            || window.msRequestAnimationFrame)
    }) (opt.fps_cap);

    /**
     * Used for calculating frames per second
     *
     * @count
     * @type frameEnum: <int>,
     * @type frameTime: <int>,
     * @type count: <int> // represents the second's frame rate. Its value is copied to CanvasNext.fps
     */
    this.STORE.frameCount =
        {
            frameEnum : 0,
            frameTime : 0,
            count : 0
        };

    /**
     * Object's Proxy handler whose primary purpose is to
     * -toggle object layer's bool to true
     *
     * @type {{set: objHandler.set}}
     */
    this.STORE.objHandler = {
        set : function(obj, key, value, init)
        {
            if ( obj[key] == value && init !== true ) return;

            // Attribute change events
            switch ( key )
            {
                // Image
                case 'image' :
                    if ( typeof value == 'string' )
                    {
                        if ( ! (value in CN.STORE.image_cache) )
                        {
                            const image = document.createElement('img');
                            image.src = value;

                            CN.STORE.image_cache[value] = image;
                            obj.image_src = CN.STORE.image_cache[value].src;
                        }

                        if ( CN.STORE.image_cache[value].complete === true )
                        {
                            obj.image = CN.STORE.image_cache[value];
                            obj.image_src = CN.STORE.image_cache[value].src;

                            return;
                        }

                        else
                            var loadedInterval = setInterval(function()
                            {
                                if ( CN.STORE.image_cache[value].complete !== true ) return;

                                obj.image = CN.STORE.image_cache[value];
                                obj.image_src = CN.STORE.image_cache[value].src;

                                // Expand atlas
                                if ( ! (value in CN.STORE.image_cache.atlas) )
                                {
                                    var canvas = CN.STORE.image_cache.canvas,
                                        ctx = CN.STORE.image_cache.ctx,
                                        tmpCanvas = CN.STORE.image_cache.tmpCanvas,
                                        image = CN.STORE.image_cache[value];

                                    if ( image.width > canvas.width ) canvas.width = image.width;
                                    canvas.height += 10 + image.height;

                                    if ( tmpCanvas.src != '' ) ctx.drawImage(tmpCanvas, 0, 0);
                                    ctx.drawImage(image, 0, canvas.height - image.height);

                                    CN.STORE.image_cache.tmpCanvas.src = canvas.toDataURL();

                                    if ( tmpCanvas.src == '' ) return;

                                    CN.STORE.image_cache.atlas[value] = CN.STORE.image_cache.atlas[image.src] = {
                                        x : 0,
                                        y : canvas.height - image.height,
                                        width : image.width,
                                        height : image.height
                                    };

                                    // Update GL textures
                                    for ( var i = 0 ; i < CN.STORE.layer.length ; i++ )
                                        CN.glUpdateTexture(CN.STORE.layer[i].webgl.gl);

                                    CN.glRefresh();
                                }

                                return clearInterval(loadedInterval);
                            }, 50)
                    }

                    else if  ( value instanceof HTMLElement )
                        if ( value.complete !== true )
                            var loadedInterval = setInterval(function()
                            {
                                if ( ! value.complete ) return;

                                // Attempt caching if source attribute contains URL
                                if ( /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/.test(value.src)
                                    && ! (value.src in CN.STORE.image_cache) )
                                    CN.STORE.image_cache[value.src] = value;

                                obj.modified = true;

                                return clearInterval(loadedInterval);
                            }, 50);
                    break;

                // Audio
                case 'audio' :
                    if ( typeof value == 'string' )
                    {
                        if ( ! (value in CN.STORE.audio_cache) )
                        {
                            var audio = document.createElement('audio');
                            audio.src = value;

                            CN.STORE.audio_cache[value] = audio;
                        }

                        if ( CN.STORE.audio_cache[value].readyState === 4 )
                            return obj.audio = CN.STORE.audio_cache[value];

                        else
                            var loadedInterval = setInterval(function()
                            {
                                if ( CN.STORE.audio_cache[value].readyState != 4 ) return;

                                obj.audio = CN.STORE.audio_cache[value];

                                return clearInterval(loadedInterval);
                            }, 50);
                    }

                    else if ( value instanceof HTMLElement )
                        if ( value.readyState != 4 )
                            value.oncanplay = function()
                            {
                                if ( ! value.complete ) return;

                                // Attempt caching if source attribute contains URL
                                if ( /(ftp|http|https):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/.test(value.src)
                                    && ! (value.src in CN.STORE.audio_cache) )
                                    CN.STORE.audio_cache[value.src] = value;

                                obj.modified = true;
                            };
                    break;

                // Layer
                // To switch layers, remove from previous layer and re-add to new layer
                case 'layer' :
                    if ( obj[key] == value ) break;

                    obj.delete = true;
                    CN.remove_obj(obj);

                    obj.layer = value;
                    CN.add_obj(obj);
                    break;

                // Delete
                // Delete object if attribute 'delete' is set
                case 'delete' :
                    CN.remove_obj(obj);
                    break;
            }

            // Call set function
            // @param: Obj, Key, oldValue, newValue
            if ( typeof obj['set'] == 'function' ) value = obj.set(obj, key, obj[key], value) || value;
        },

        get : function(obj, key)
        {
            // Handle get function
            return typeof obj['get'] != 'undefined' && obj.get(obj, key) || obj[key];
        }
    };

    delete this.initialize;

    /**
     * Return the API
     */
    {
        var APIHandler = { set : function(obj, key, value)
            {
                switch ( key )
                {
                    case 'width' : obj.STORE.canvas.width = value; break;
                    case 'height' : obj.STORE.canvas.height = value; break;

                    case 'fps_cap' :
                        obj.STORE.fps_cap = value;
                        if ( value > 0 ) CN.callback();
                        break;
                }

                obj[key] = value;
            }};

        var API = new Proxy(this, APIHandler);

        for ( var i in API ) API[i] = API[i];

        return API;
    }
};

CanvasNext.prototype.callback = function()
{
    /**
     * Enumerate the frames count & declare second's frame rate
     */
    {
        // Enumerate the frame count with every callback
        this.STORE.fps_cap !== 0 && this.STORE.frameCount.frameEnum++;

        // Declare the second's frame rate & clear the enumeration by the threshold
        if ( this.STORE.frameCount.frameTime + 1000 < new Date().getTime() )
            this.STORE.frameCount.count = this.STORE.frameCount.frameEnum,
                this.STORE.frameCount.frameEnum = 0,
                this.STORE.frameCount.frameTime = new Date().getTime();

        this.fps = this.STORE.frameCount.count;
        this.STORE.fps_cap = this.fps_cap || this.STORE.fps_cap;
    }

    this.comparator();
    this.render();

    // Don't trigger a new callback if the FPS cap is 0
    if ( this.STORE.fps_cap === 0 ) return this.fps = 0;

    if ( this.STORE.fps_cap === requestAnimationFrame || (this.fps < 61 && this.STORE.fps_cap >= 61) )
        this.STORE.callback_timer = requestAnimationFrame(this.callback.bind(this));
    else
        clearTimeout(this.STORE.callback_timer),
            this.STORE.callback_timer = setTimeout(this.callback.bind(this));
};

CanvasNext.prototype.comparator = function()
{
    for ( var i = 0 ; i < this.STORE.layer.length ; i++  )
        if ( this.STORE.layer[i].use_webgl === false )
            for ( var j = 0 ; j < this.STORE.layer[i].obj.length ; j++ )
                for ( var k in this.STORE.layer[i].obj[j] )
                    if ( this.STORE.layer[i].obj_compare[j][k] !== this.STORE.layer[i].obj[j][k] )
                    {
                        this.STORE.objHandler.set(this.STORE.layer[i].obj[j], k, this.STORE.layer[i].obj[j][k], true);

                        this.STORE.layer[i].obj_compare[j][k] = this.STORE.layer[i].obj[j][k];

                        if ( this.STORE.layer[i].modified === false )
                            this.STORE.layer[i].modified = true;
                    }
};

CanvasNext.prototype.render = function()
{
    var CN = this;

    // Attempt to redraw every layer
    for ( var layer = 0 ; layer < this.STORE.layer.length ; layer++ )
    {
        var target_layer = this.STORE.layer[layer],
            target_canvas = target_layer.use_webgl !== true ? target_layer.canvas : target_layer.webgl.canvas;

        // Only redraw this layer if it's declared modified
        if ( target_layer.modified !== true && target_layer.use_webgl === false ) continue;

        // For WebGL, compile custom shaders
        if ( target_layer.use_webgl === true )
        {
            var vert_shader_change = false;
            for ( var i = 0 ; i < target_layer.vertexShader.length ; i++ )
                if ( target_layer.webgl.compileVertexShader[i] != target_layer.vertexShader[i] )
                {
                    target_layer.webgl.compileVertexShader[i] = target_layer.vertexShader[i];
                    vert_shader_change = true;
                }

            var frag_shader_change = false;
            for ( var i = 0 ; i < target_layer.fragmentShader.length ; i++ )
                if ( target_layer.webgl.compileFragmentShader[i] != target_layer.fragmentShader[i] )
                {
                    target_layer.webgl.compileFragmentShader[i] = target_layer.fragmentShader[i];
                    frag_shader_change = true;
                }

            if ( vert_shader_change || frag_shader_change )
                this.glRecompileShaders(
                    target_layer,
                    vert_shader_change && target_layer.vertexShader || undefined,
                    frag_shader_change && target_layer.fragmentShader || undefined
                )
        }

        // Attempt to rescale layer's canvas size to the furthest object
        if ( target_layer.use_webgl !== true )
        {
            if ( target_layer.clear !== false ) target_layer.ctx.clearRect(0, 0, target_canvas.width, target_canvas.height);

            // Rescale layers based on object's positions. Primarily used for image buffering
            for ( var obj = 0 ; obj < target_layer.obj.length ; obj++ )
            {
                var target_obj = target_layer.obj[obj];

                if ( target_obj.x + target_obj.width > target_canvas.width )
                    target_canvas.width = Math.max(this.STORE.canvas.width, target_obj.x + target_obj.width);

                if (target_obj.y + target_obj.height > target_canvas.height )
                    target_canvas.height = Math.max(this.STORE.canvas.height, target_obj.y + target_obj.height);
            }
        }

        // Draw objects on the layer
        for ( var obj = 0, objlen = target_layer.obj.length ; obj < objlen ; obj++ )
        {
            if ( target_layer.obj[obj]['visible'] === false ) continue;

            // Optimization: don't draw the object if it's outside the canvas viewport
            if ( target_layer.position != 'absolute' /*&& target_layer.buffer !== true*/ && target_layer.obj[obj].buffer !== true && ! (
                ( target_layer.obj[obj].x + target_layer.obj[obj].width >= this.STORE.camera.x
                    && target_layer.obj[obj].x <= this.STORE.camera.x + this.STORE.canvas.width )
                && ( target_layer.obj[obj].y + target_layer.obj[obj].height >= this.STORE.camera.y
                    && target_layer.obj[obj].y <= this.STORE.camera.y + this.STORE.canvas.height )
            ) ) continue;

            // Draw the object
            // Fill GL buffer in case you're using WebGL
            if ( target_layer.use_webgl !== true )
                this.draw(target_layer.ctx, target_layer.obj[obj]);
            else
                CN.glUpdateBuffer(target_layer, target_layer.obj[obj]);
        }

        target_layer.modified = false;
    }

    // Draw the frame by drawing the layers together in order
    {
        this.STORE.ctx.clearRect(0, 0, this.STORE.canvas.width, this.STORE.canvas.height);

        for ( var i = 0 ; i < this.STORE.layer.length ; i++ )
            if ( this.STORE.layer[i].obj.length > 0 )
            {
                // Optionally draw WebGL triangles
                if ( this.STORE.layer[i].use_webgl === true )
                    this.glDraw(this.STORE.layer[i]),
                        canvas = this.STORE.layer[i].webgl.canvas;
                else
                    canvas = this.STORE.layer[i].canvas;

                this.draw(this.STORE.ctx, {
                    image : canvas,
                    x : 0,
                    y : 0,
                    crop : [
                        this.STORE.layer[i].position != 'absolute' && this.STORE.layer[i].use_webgl !== true && this.STORE.camera.x || 0,
                        this.STORE.layer[i].position != 'absolute' && this.STORE.layer[i].use_webgl !== true && this.STORE.camera.y || 0,
                        this.STORE.layer[i].canvas.width,
                        this.STORE.layer[i].canvas.height
                    ],
                    width : this.STORE.layer[i].canvas.width * this.STORE.camera.z,
                    height : this.STORE.layer[i].canvas.height * this.STORE.camera.z,
                    rotate : this.STORE.camera.rotate,
                })
            }
    }
};

/**
 * Draw into a 2D CTX
 *
 * @param ctx
 * @param obj
 * @param opt (optional)
 *      {
 *          x : int,
 *          y : int
 *      }
 */
CanvasNext.prototype.draw = function (ctx, obj, opt)
{
    opt = opt || {};

    ctx.save();

    // Clear rect if specified
    if ( opt.clear === true )
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    var x = obj.x || opt.x || 0,
        y = obj.y || opt.y || 0;

    // Opacity
    if ( typeof obj['opacity'] != 'undefined' )
        ctx.globalAlpha = obj['opacity'];

    // Perform rotation
    if ( typeof obj['rotate'] != 'undefined' )
    {
        ctx.translate( obj['x'] + obj['width'] / 2, obj['y'] + obj['height'] / 2 );

        ctx.rotate( obj['rotate'] * Math.PI / 180 );

        ctx.translate( -(obj['x'] + obj['width'] / 2), -(obj['y'] + obj['height'] / 2) );
    }

    // Render text, set optional fillStyle element
    if ( typeof obj['text'] != 'undefined' )
        ctx.fillStyle = obj['text'][2],
            ctx.font = obj['text'][1],
            ctx.fillText( obj['text'][0], obj['x'], obj['y'] );

    // Set fillStyle
    if ( typeof obj['fillStyle'] != 'undefined' )
        ctx.fillStyle = obj['fillStyle'];

    // Draw a rectangle
    if ( typeof obj['bg_color'] != 'undefined' )
    {
        ctx.fillStyle = typeof obj['bg_color'] == 'string'
            ? obj['bg_color']
            : 'rgba(' + obj['bg_color'].join(',') + ')';

        ctx.fillRect(x, y, obj['width'], obj['height']);
    }

    // Draw arc
    if ( typeof obj['arc'] != 'undefined' )
    {
        ctx.beginPath();

        ctx.fillStyle = obj['arc'][6];

        ctx.arc(
            obj['arc'][0],
            obj['arc'][1],
            obj['arc'][2],
            obj['arc'][3],
            obj['arc'][4],
            obj['arc'][5]
        );

        ctx.stroke();
    }

    // Draw line
    if ( typeof obj['line'] != 'undefined' )
    {
        ctx.beginPath();

        // Declare variables
        // If index 0 == array, iterate line path
        if ( typeof obj['line'][0] == 'object' )
        {
            var lineWidth = obj['line'][1] || 1,
                R = obj['line'][2],
                G = obj['line'][3],
                B = obj['line'][4],
                A = obj['line'][5];

            ctx.moveTo(obj['line'][0][0], obj['line'][0][1]);

            for ( var i = 2 ; i < obj['line'][0].length ; i += 2 )
                ctx.lineTo(obj['line'][0][i], obj['line'][0][i+1]);
        }

        else
        {
            var lineWidth = obj['line'][4] || 1,
                R = obj['line'][5],
                G = obj['line'][6],
                B = obj['line'][7],
                A = obj['line'][8];

            ctx.moveTo(obj['line'][0], obj['line'][1]);
            ctx.lineTo(obj['line'][2], obj['line'][3]);
        }

        ctx.lineWidth = lineWidth;
        ctx.strokeStyle = 'rgba(' + R + ', ' + G + ', ' + B + ', ' + A + ')';

        ctx.stroke();
    }

    // Draw an image
    if ( typeof obj['image'] != 'undefined'
        && (
            obj['image'] instanceof HTMLImageElement && obj.image.complete
            || obj['image'] instanceof HTMLCanvasElement)
    )
    {
        if ( typeof obj['crop'] != 'undefined' )
        {
            ctx.drawImage(
                obj['image'],                               // Image reference
                obj['crop'][0],                             // sx
                obj['crop'][1],                             // sy
                obj['crop'][2],                             // swidth
                obj['crop'][3],                             // sheight
                obj['x'],                                   // x
                obj['y'],                                   // y
                obj['width'],                               // width
                obj['height']                               // height
            );
        }

        else if ( obj['width'] != undefined && obj['height'] != undefined )
        {
            ctx.drawImage(
                ( obj['image'] instanceof HTMLElement
                    ? obj['image']
                    : obj['image']['default'] ),            // Image reference
                x,                                          // sx
                y,                                          // sy
                obj['width'],                               // swidth
                obj['height']                               // sheight
            );
        }

        else
            ctx.drawImage(
                ( obj['image'] instanceof HTMLElement
                    ? obj['image']
                    : obj['image']['default'] ),            // Image reference
                x,                                          // sx
                y                                           // sy
            );

    }

    // Run a function for e.g low-level rendering
    if ( typeof obj['run'] == 'function' )
    {
        ctx.translate(obj['x'], obj['y']);

        obj['run'](ctx);
    }

    ctx.restore();
};

CanvasNext.prototype.add_obj = function(obj)
{
    var layers = this.STORE.layer;

    obj.layer = parseInt(obj.layer) || 1;

    // Create object Proxy
    //obj = new Proxy(obj, this.STORE.objHandler);

    // Iteratively create layers if they don't exist
    if ( typeof layers[obj.layer-1] == 'undefined' )
        for ( var i = layers.length ; i < obj.layer ; i++ )
            this.add_layer();

    // Set default values for common properties
    {
        obj.x = obj.x || 0;
        obj.y = obj.y || 0;

        obj.width = obj.width || 0;
        obj.height = obj.height || 0;

        // Initialize object by calling Proxy handler for every property
        for ( var i in obj )
            this.STORE.objHandler.set(obj, i, obj[i], true);
    }

    // Add object to specified layer
    layers[obj.layer-1].obj.push(obj);
    layers[obj.layer-1].obj_compare.push({});

    /**
     * For WebGL, allocate object to buffer arrays
     */
    {
        var layer = layers[obj.layer-1];

        if ( layer.obj.length > layer.webgl.verts.length / 24 )
            this.glExpandBuffer(layer, 100);

        for ( var i = 0 ; i < layer.webgl[layer.webgl.bufferList[0]].length ; i += 24 )
            if ( layer.webgl[layer.webgl.bufferList[0]][i] === -1 )
            {
                for ( var j = 0 ; j < layer.webgl.bufferList.length ; j++ )
                    layer.webgl[layer.webgl.bufferList[j]].set(layer.webgl.fModel, i);

                obj.index = i;

                break;
            }
    }

    return obj;
};

CanvasNext.prototype.remove_obj = function(obj)
{
    var layer = this.STORE.layer[obj.layer-1];

    // Remove this object from the associated layer
    for ( var i in layer.obj )
        if ( layer.obj[i] == obj || layer.obj[i].delete === true )
        {
            layer.obj.splice(i, 1);
            layer.obj_compare.splice(i, 1);

            break;
        }

    // For WebGL, remove object from the buffer array
    {
        layer.webgl.verts[obj.index] = -1;

        //for ( var j = 0 ; j < layer.webgl.bufferList.length ; j++ )
        //    layer.webgl[layer.webgl.bufferList[j]].set(layer.webgl.fModelVoid, obj.index)
    }

    layer.modified = true;
};

CanvasNext.prototype.add_layer = function(obj)
{
    obj = obj || {};

    // Set default values for common properties
    {
        obj.modified = true;
        obj.position = obj.position || 'relative';
        obj.obj = obj.obj || [];
        obj.obj_compare = [];
        obj.buffer = obj.buffer || false;

        obj.canvas = document.createElement('canvas');
        obj.ctx = obj.canvas.getContext('2d');

        obj.canvas.width = this.STORE.canvas.width;
        obj.canvas.height = this.STORE.canvas.height;

        // todo: fix
        //obj.use_webgl = false;
        obj.use_webgl = obj.use_webgl || false;
        obj.use_webgl = false; // Todo: DELETE
    }

    /**
     * Add WebGL components
     */
    {
        var webgl = obj.webgl = {};

        var canvas = webgl.canvas = document.createElement('canvas');

        canvas.width = this.STORE.canvas.width;
        canvas.height = this.STORE.canvas.height;

        var gl = webgl.gl = canvas.getContext('webgl');

        // Setup GLSL programs
        {
            // Scripts are in template literals. ES6 required
            var vertexShaderScript = webgl.vertexShaderScript = `
                attribute vec4 a_position;
                attribute vec4 a_texcoord;
                attribute vec4 a_property;
                attribute vec4 a_textureCrop;
                
                uniform vec4 u_camera;
                
                varying vec4 v_texcoord;
                varying vec4 textureCrop;
                
                void main(void)
                {
                 // Discard if this vertex is -1
                 if ( a_property.x == -1.0 )
                    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
                
                 else
                 {
                     /*** Handle geometry & rotation ***/
                     // Reposition for centered rotation
                     vec2 position = vec2(a_position.x - a_position.z / 2.0,
                                          a_position.y - a_position.w / 2.0);
                    
                     vec2 rotatedPosition = a_property.x == 0.0 && a_property.y == 1.0
                                            ? position
                                            : vec2(position.x * a_property.y + position.y * a_property.x,
                                                   position.y * a_property.y - position.x * a_property.x);
                    
                     // Restore position
                     rotatedPosition.x += a_position.z / 2.0;
                     rotatedPosition.y += a_position.w / 2.0;
                    
                     gl_Position = vec4(((vec2(u_camera.x, u_camera.y) *-1.0 + rotatedPosition + vec2(a_property.z, a_property.w)) / vec2(u_camera.z, u_camera.w) * 2.0 - 1.0) * vec2(1, -1), 0, 1);
                    
                     /*** Set texture & properties ***/
                     textureCrop = a_textureCrop;
                     v_texcoord = a_texcoord;
                 }
                 
                 //CN_CustomShader
                }
            `;
            var fragmentShaderScript = webgl.fragmentShaderScript = `
                precision lowp float;
    
                varying vec4 textureCrop;
                uniform vec2 u_textureDimension;
                
                varying vec4 v_texcoord;
                uniform sampler2D texture;
                
                void main(void)
                {
                 // Discard if this fragment is -1
                 if ( v_texcoord.x == -1.0 ) discard;
                
                 // Decide whether to draw texture or RGBA
                 if ( v_texcoord.w < 0.0 )
                     gl_FragColor = texture2D(
                        texture,
                        vec2(v_texcoord.x * textureCrop.z / u_textureDimension.x + textureCrop.x / u_textureDimension.x,
                             v_texcoord.y * textureCrop.w / u_textureDimension.y + textureCrop.y / u_textureDimension.y)
                     );
                
                 else
                    gl_FragColor = v_texcoord;
                    
                 //CN_CustomShader
                }
            `;

            vertexShaderScript = webgl.vertexShaderScript = document.getElementById('2d-vertex-shader') && document.getElementById('2d-vertex-shader').text || vertexShaderScript;
            fragmentShaderScript = webgl.fragmentShaderScript = document.getElementById('2d-fragment-shader') && document.getElementById('2d-fragment-shader').text || fragmentShaderScript;

            var vertexShader = webgl.vertexShader = gl.createShader(gl.VERTEX_SHADER);
            gl.shaderSource(vertexShader, vertexShaderScript);
            gl.compileShader(vertexShader);

            var fragmentShader = webgl.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
            gl.shaderSource(fragmentShader, fragmentShaderScript);
            gl.compileShader(fragmentShader);

            gl.program = gl.createProgram();
            gl.attachShader(gl.program, vertexShader);
            gl.attachShader(gl.program, fragmentShader);
            gl.linkProgram(gl.program);
            gl.useProgram(gl.program);
        }

        // WebGL settings
        {
            gl.disable(gl.DEPTH_TEST);
            gl.disable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        }

        // Create buffers & attributes
        {
            var positionLocation = webgl.positionLocation = gl.getAttribLocation(gl.program, 'a_position');
            var propertyLocation = webgl.propertyLocation = gl.getAttribLocation(gl.program, 'a_property');
            var texcoordLocation = webgl.texcoordLocation = gl.getAttribLocation(gl.program, 'a_texcoord');
            var textureCropLocation = webgl.textureCropLocation = gl.getAttribLocation(gl.program, 'a_textureCrop');

            var bufferPosition = webgl.bufferPosition = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferPosition);
            gl.enableVertexAttribArray(positionLocation);
            gl.vertexAttribPointer(positionLocation, 4, gl.FLOAT, false, 0, 0);

            var bufferProperty = webgl.bufferProperty = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferProperty);
            gl.enableVertexAttribArray(propertyLocation);
            gl.vertexAttribPointer(propertyLocation, 4, gl.FLOAT, false, 0, 0);

            var bufferTexcoord = webgl.bufferTexcoord = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferTexcoord);
            gl.enableVertexAttribArray(texcoordLocation);
            gl.vertexAttribPointer(texcoordLocation, 4, gl.FLOAT, false, 0, 0);

            var bufferTextureCrop = webgl.bufferTextureCrop = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferTextureCrop);
            gl.enableVertexAttribArray(textureCropLocation);
            gl.vertexAttribPointer(textureCropLocation, 4, gl.FLOAT, false, 0, 0);

            var bufferTextureCrop = webgl.bufferTextureCrop = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, bufferTextureCrop);
            gl.enableVertexAttribArray(textureCropLocation);
            gl.vertexAttribPointer(textureCropLocation, 4, gl.FLOAT, false, 0, 0);

            var maxEntities = 1;

            // Buffer data
            var verts = webgl.verts = new Float32Array(24 * maxEntities).fill(-1);
            var properties = webgl.properties = new Float32Array(24 * maxEntities).fill(-1);
            var texcoords = webgl.texcoords = new Float32Array(24 * maxEntities).fill(-1);
            var textureCrop = webgl.textureCrop = new Float32Array(24 * maxEntities).fill(-1);

            webgl.bufferList = [
                'verts',
                'properties',
                'texcoords',
                'textureCrop'
            ];

            webgl.stateChanges = [
                false,
                false,
                false,
                false
            ];

            webgl.fModel = new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
            webgl.fModelVoid = new Float32Array([-1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1, -1]);
        }

        // Set attributes
        {
            var cameraLocation = webgl.cameraLocation = gl.getUniformLocation(gl.program, 'u_camera');
            gl.uniform4f(cameraLocation, this.STORE.camera.x, this.STORE.camera.y, this.STORE.canvas.width, this.STORE.canvas.height);

            var textureDimensionLocation = webgl.textureDimensionLocation = gl.getUniformLocation(gl.program, 'u_textureDimension');
            gl.uniform2f(textureDimensionLocation, this.STORE.image_cache.canvas.width, this.STORE.image_cache.canvas.height);

            var mouseCoordLocation = webgl.mouseCoordLocation = gl.getUniformLocation(gl.program, 'u_mouseCoord');
            gl.uniform2f(mouseCoordLocation, 0.0, 0.0);
        }

        // Custom shaders
        {
            obj.vertexShader = [];
            webgl.compileVertexShader = [];
            obj.fragmentShader = [];
            webgl.compileFragmentShader = [];
        }

        // Custom uniforms
        {
            obj.uniforms = {};
            webgl.customUniformLocations = {};
        }

        this.glUpdateTexture(gl);
    }

    this.STORE.layer.push(obj);

    return obj;
};

CanvasNext.prototype.glDraw = function(layer)
{
    if ( layer.clear !== false )
        layer.webgl.gl.clear(layer.webgl.gl.COLOR_BUFFER_BIT | layer.webgl.gl.DEPTH_BUFFER_BIT);

    /**
     * Drawing triangles
     */
    {
        // Geometry buffer
        if ( layer.webgl.stateChanges[0] === true  )
        {
            layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferPosition);
            layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.verts, layer.webgl.gl.DYNAMIC_DRAW);

            layer.webgl.stateChanges[0] = false;
        }

        // Properties buffer
        if ( layer.webgl.stateChanges[1] === true )
        {
            layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferProperty);
            layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.properties, layer.webgl.gl.DYNAMIC_DRAW);

            layer.webgl.stateChanges[1] = false;
        }

        // Texcoord buffer
        if ( layer.webgl.stateChanges[2] === true )
        {
            layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferTexcoord);
            layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.texcoords, layer.webgl.gl.DYNAMIC_DRAW);

            layer.webgl.stateChanges[2] = false;
        }

        // Texture crop buffer
        if ( layer.webgl.stateChanges[3] === true )
        {
            layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferTextureCrop);
            layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.textureCrop, layer.webgl.gl.DYNAMIC_DRAW);

            layer.webgl.stateChanges[3] = false;
        }

        layer.webgl.gl.drawArrays(layer.webgl.gl.TRIANGLES, 0, layer.webgl.verts.length / 4);
    }

    /**
     * Drawing lines
     */
    {
        return;

        layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferPosition);
        layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0]), layer.webgl.gl.DYNAMIC_DRAW);

        layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferProperty);
        layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0,
            0, 0, 0, 50,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0,
            0, 0, 0, 0]), layer.webgl.gl.DYNAMIC_DRAW);

        layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferTexcoord);
        layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, new Float32Array([100, 0, 100, 1, 100, 0, 100, 1, 100, 0, 100, 1, 100, 0, 100, 1, 100, 0, 100, 1, 100, 0, 100, 1]), layer.webgl.gl.DYNAMIC_DRAW);

        layer.webgl.gl.bindBuffer(layer.webgl.gl.ARRAY_BUFFER, layer.webgl.bufferTextureCrop);
        layer.webgl.gl.bufferData(layer.webgl.gl.ARRAY_BUFFER, new Float32Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), layer.webgl.gl.DYNAMIC_DRAW);

        layer.webgl.gl.drawArrays(layer.webgl.gl.LINES, 0, layer.webgl.verts.length / 4);
    }
};


CanvasNext.prototype.glFloat32Concat = function(a, b)
{
    var aLength = a.length,
        result = new Float32Array(aLength + b.length);

    result.set(a);
    result.set(b, aLength);

    return result;
};

CanvasNext.prototype.glExpandBuffer = function(layer, length)
{
    for ( var i = 0 ; i < layer.webgl.bufferList.length ; i++ )
        layer.webgl[layer.webgl.bufferList[i]] = this.glFloat32Concat(layer.webgl[layer.webgl.bufferList[i]], new Float32Array(24 * length).fill(-1))
};

CanvasNext.prototype.glUpdateBuffer = function(layer, obj)
{
    // Discard if object is void
    if ( layer.webgl.verts[obj.index] == -1 ) return;

    // Set helper variables
    {
        var webgl = layer.webgl;
    }

    // Format default properties
    {
        var rotate = typeof obj['rotate'] != 'undefined' ? obj.rotate * Math.PI / 180 * -1 : 0;
        var opacity = typeof obj['opacity'] != 'undefined' ? parseFloat(obj.opacity.toFixed(3)) : 1;
    }

    // Rectangle drawing
    {
        // Geometry
        if (
            webgl.verts[obj.index + 2] !== obj.width
            || webgl.verts[obj.index + 3] !== obj.height
        )
        {
            webgl.verts.set([
                0,
                0,
                obj.width,
                obj.height,
                obj.width,
                0,
                obj.width,
                obj.height,
                0,
                obj.height,
                obj.width,
                obj.height,
                0,
                obj.height,
                obj.width,
                obj.height,
                obj.width,
                0,
                obj.width,
                obj.height,
                obj.width,
                obj.height,
                obj.width,
                obj.height
            ], obj.index);

            webgl.stateChanges[0] = true;
        }

        // Properties
        {
            var s = Math.sin(rotate);
            var c = Math.cos(rotate);

            if (
                webgl.properties[obj.index + 2] !== obj.x
                || webgl.properties[obj.index + 3] !== obj.y
                || webgl.properties[obj.index] !== s
                || webgl.properties[obj.index + 1] !== c
            )
            {
                webgl.properties.set([
                    s,
                    c,
                    obj.x,
                    obj.y,
                    s,
                    c,
                    obj.x,
                    obj.y,
                    s,
                    c,
                    obj.x,
                    obj.y,
                    s,
                    c,
                    obj.x,
                    obj.y,
                    s,
                    c,
                    obj.x,
                    obj.y,
                    s,
                    c,
                    obj.x,
                    obj.y
                ], obj.index);

                webgl.stateChanges[1] = true;
            }
        }
    }

    // Texcoords
    // Texture / bg_color
    if ( typeof obj['image'] == 'object' && obj['image'].complete === true )
    {
        // Coloring onto texcoords
        // [ x, y || r, g, b, a ]
        if (
            typeof webgl.texcoords[obj.index + 2] != 'undefined'
            && webgl.texcoords[obj.index + 2] !== opacity
            && (parseFloat(webgl.texcoords[obj.index + 2].toFixed(3)) < opacity
            || parseFloat(webgl.texcoords[obj.index + 2].toFixed(3)) > opacity)
        )
        {
            webgl.texcoords.set([
                0,
                0,
                opacity,
                -1,
                1,
                0,
                opacity,
                -1,
                0,
                1,
                opacity,
                -1,
                0,
                1,
                opacity,
                -1,
                1,
                0,
                opacity,
                -1,
                1,
                1,
                opacity,
                -1
            ], obj.index);
        }

        if ( typeof obj['atlas'] == 'undefined' && this.STORE.image_cache.atlas[obj.image_src] )
            if ( typeof obj['crop'] == 'undefined' )
                obj.atlas = [
                    this.STORE.image_cache.atlas[obj.image_src].x,
                    this.STORE.image_cache.atlas[obj.image_src].y,
                    this.STORE.image_cache.atlas[obj.image_src].width,
                    this.STORE.image_cache.atlas[obj.image_src].height
                ];
            else
                obj.atlas = ([
                    obj['crop'][0] + this.STORE.image_cache.atlas[obj.image_src].x,
                    obj['crop'][1] + this.STORE.image_cache.atlas[obj.image_src].y,
                    obj['crop'][2],
                    obj['crop'][3]
                ]);

        if (
            typeof obj['atlas'] != 'undefined' &&
            (webgl.textureCrop[obj.index]        !== obj.atlas[0] || 0
                || webgl.textureCrop[obj.index + 1] !== obj.atlas[1] || 0
                || webgl.textureCrop[obj.index + 2] !== obj.atlas[2] || 0
                || webgl.textureCrop[obj.index + 3] !== obj.atlas[3] || 0)
        )
        {
            webgl.textureCrop.set([
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3],
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3],
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3],
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3],
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3],
                obj.atlas[0],
                obj.atlas[1],
                obj.atlas[2],
                obj.atlas[3]
            ], obj.index);
        }

        webgl.stateChanges[2] = true;
        webgl.stateChanges[3] = true;
    }

    // Todo : color "0" creates rendering issues
    else if ( typeof obj['bg_color'] != 'undefined' )
    {
        // Coloring onto texcoords
        // [ x, y || r, g, b, a ]
        // Todo: Error occurs when changing *only* bg_color array
        //if (
        //    webgl.texcoords[obj.index]     !== obj.bg_color[0] / 255
        //    && webgl.texcoords[obj.index + 1] !== obj.bg_color[1] / 255
        //    && webgl.texcoords[obj.index + 2] !== obj.bg_color[2] / 255
        //    && webgl.texcoords[obj.index + 3] !== obj.bg_color[3] / 1
        //)
        {
            webgl.texcoords.set([
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3],
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3],
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3],
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3],
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3],
                obj.bg_color[0]+1 / 255,
                obj.bg_color[1]+1 / 255,
                obj.bg_color[2]+1 / 255,
                obj.bg_color[3]
            ], obj.index);

            webgl.stateChanges[2] = true;
            webgl.stateChanges[3] = true;
        }
    }
};

CanvasNext.prototype.glUpdateTexture = function(gl)
{
    var img = this.STORE.image_cache.canvas;

    var textureInfo = {
        width: img.width,
        height: img.height,
        texture: gl.createTexture()
    };

    gl.bindTexture(gl.TEXTURE_2D, textureInfo.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);

    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return textureInfo;
};

CanvasNext.prototype.glRefresh = function()
{
    // Update every layer's WebGL's default & custom uniforms, & rescale the canvas
    for ( var i = 0 ; i < this.STORE.layer.length ; i++ )
    {
        var layer = this.STORE.layer[i],
            webgl = layer.webgl,
            gl = webgl.gl;

        webgl.cameraLocation = gl.getUniformLocation(gl.program, 'u_camera');
        webgl.textureDimensionLocation = gl.getUniformLocation(gl.program, 'u_textureDimension');
        webgl.mouseCoordLocation = gl.getUniformLocation(gl.program, 'u_mouseCoord');

        webgl.gl.uniform4f(webgl.cameraLocation, this.STORE.camera.x, this.STORE.camera.y, webgl.canvas.width, webgl.canvas.height);
        webgl.gl.uniform2f(webgl.textureDimensionLocation, this.STORE.image_cache.canvas.width, this.STORE.image_cache.canvas.height);
        webgl.gl.uniform2f(webgl.mouseCoordLocation, this.mouse.x, this.mouse.y * -1 + webgl.canvas.height);

        for ( var j in layer.uniforms )
        {
            var value = typeof layer.uniforms[j] == 'object' ? new Float32Array(layer.uniforms[j]) : layer.uniforms[j];

            webgl.customUniformLocations[j] = gl.getUniformLocation(gl.program, j);

            if ( typeof value == 'object' )
                gl.uniform1fv(webgl.customUniformLocations[j], value);
            else
                gl.uniform1f(webgl.customUniformLocations[j], value);
        }
    }
};

CanvasNext.prototype.glRecompileShaders = function (layer, vert, frag)
{
    const webgl = layer.webgl,
        gl = webgl.gl;

    // Add custom uniforms
    let uniform_str = '';
    for ( let i in layer.uniforms )
        uniform_str += typeof layer.uniforms[i] == 'object'
            ? '\nuniform float ' + i + '[' + layer.uniforms[i].length + '];'
            : '\nuniform float ' + i + ';'

    // Append shader code
    vert = vert && webgl.vertexShaderScript.replace('//CN_CustomShader', webgl.compileVertexShader.join('\n')) || webgl.vertexShaderScript;
    frag = frag && webgl.fragmentShaderScript.replace('//CN_CustomShader', webgl.compileFragmentShader.join('\n')) || webgl.fragmentShaderScript;

    // Declare custom uniforms
    vert = vert.replace('//CN_CustomUniform', uniform_str);
    frag = frag.replace('//CN_CustomUniform', uniform_str);

    // Optionally console log shaders
    if ( this.gl_log_shaders === true || this.gl_log_shaders_vertex === true ) console.info(vert);
    if ( this.gl_log_shaders === true || this.gl_log_shaders_fragment === true ) console.info(frag);

    // Vertex shader
    webgl.vertexShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(webgl.vertexShader, vert);
    gl.compileShader(webgl.vertexShader);

    // Vertex shader
    webgl.fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(webgl.fragmentShader, frag);
    gl.compileShader(webgl.fragmentShader);

    // Error reporting
    if ( ! gl.getShaderParameter(webgl.vertexShader, gl.COMPILE_STATUS) )
        console.error('Shader compiler log: ' + gl.getShaderInfoLog(webgl.vertexShader));

    if ( ! gl.getShaderParameter(webgl.fragmentShader, gl.COMPILE_STATUS) )
        console.error('Shader compiler log: ' + gl.getShaderInfoLog(webgl.fragmentShader));

    // Program
    gl.program = gl.createProgram();
    gl.attachShader(gl.program, webgl.vertexShader);
    gl.attachShader(gl.program, webgl.fragmentShader);
    gl.linkProgram(gl.program);
    gl.useProgram(gl.program);

    this.glRefresh();
};
