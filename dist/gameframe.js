(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
/* global AFRAME, THREE */

let loading = false

AFRAME.registerComponent("include", {
  schema: { type: "string" },

  update: async function () {
    if (this.data && !loading) {
      loading = true
      console.log("Including", this.data)
      this.el.outerHTML = await (await fetch(this.data)).text()
      loading = false
      let next = this.el.sceneEl.querySelector("[include]")
      if (next)
        next.components.include.update()
    }
  }
})

},{}],2:[function(require,module,exports){
/* global AFRAME, THREE, OIMO */

// let scripts = document.getElementsByTagName("script")
// const workerUrl = scripts[scripts.length - 1].src

function stringify(val) {
  return JSON.stringify(val).replaceAll(" ", "\\u0020").replaceAll("\"_", "\"")
}

AFRAME.registerSystem("physics", {
  schema: {
    workerUrl: { type: "string" },
    gravity: { type: "vec3", default: { x: 0, y: -9.8, z: 0 } },
    debug: { type: "boolean", default: false }
  },

  update: function () {
    if (this.data.workerUrl) {
      if (!this.worker) {
        this.worker = new Worker(this.data.workerUrl)
        this.worker.addEventListener("message", this.onMessage.bind(this))
      }
      this.bodies = this.bodies || []
      this.movingBodies = this.movingBodies || []
      this.buffers = [new Float64Array(8), new Float64Array(8)]
      this.worker.postMessage("world gravity = " + stringify(this.data.gravity))
      this._debug = this.data.debug
    } else {
      this.remove()
    }
  },

  remove: function () {
    this.worker && this.worker.terminate()
    this.worker = null
    this.bodies = []
    this.movingBodies = []
  },

  tick: function (time, timeDelta) {
    if (!this.worker) return
    if (this.buffers.length < 2) return
    let buffer = this.buffers.shift()
    if (buffer.length < 8 * this.movingBodies.length) {
      let len = buffer.length
      while (len < 8 * this.movingBodies.length) {
        len *= 2
      }
      let bods = this.movingBodies
      let b = new Float64Array(len)
      let vec = THREE.Vector3.temp()
      let quat = THREE.Quaternion.temp()
      b.set(buffer)
      for (let i = buffer.length / 8; i < bods.length; i++) {
        let p = i * 8
        if (bods[i]) {
          bods[i].object3D.getWorldPosition(vec)
          b[p++] = vec.x
          b[p++] = vec.y
          b[p++] = vec.z
          p++
          bods[i].object3D.getWorldQuaternion(quat)
          b[p++] = quat.x
          b[p++] = quat.y
          b[p++] = quat.z
          b[p++] = quat.w
        }
      }
      buffer = b
    }
    this.worker.postMessage(buffer, [buffer.buffer])
  },

  onMessage: function (e) {
    if (e.data instanceof Float64Array) {
      this.buffers.push(e.data)
      while (this.buffers.length > 2)
        this.buffers.shift()
    }
  }
})

AFRAME.registerComponent("body", {
  dependencies: ["position", "rotation", "scale"],

  schema: {
    type: { type: "string", default: "static" }
  },

  init: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    let bodies = this.el.sceneEl.systems.physics.bodies
    let movingBodies = this.el.sceneEl.systems.physics.movingBodies
    let buffer = this.el.sceneEl.systems.physics.buffers[0]
    if (!worker) return
    this.id = bodies.indexOf(null)
    if (this.id < 0) this.id = bodies.length
    bodies[this.id] = this.el
    if (this.data.type !== "static") {
      this.mid = movingBodies.indexOf(null)
      if (this.mid < 0) this.mid = movingBodies.length
      movingBodies[this.mid] = this.el
    } else {
      this.mid = null
    }
    let body = { mid: this.mid }
    body.type = this.data.type
    body.position = this.el.object3D.getWorldPosition(THREE.Vector3.temp())
    body.quaternion = this.el.object3D.getWorldQuaternion(THREE.Quaternion.temp())
    if (this.mid !== null) {
      let p = this.mid * 8
      buffer[p++] = body.position.x
      buffer[p++] = body.position.y
      buffer[p++] = body.position.z
      p++
      buffer[p++] = body.quaternion.x
      buffer[p++] = body.quaternion.y
      buffer[p++] = body.quaternion.z
      buffer[p++] = body.quaternion.w
    }
    this.shapes = []
    worker.postMessage("world body " + this.id + " create " + stringify(body))
  },

  update: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    if (!worker) return
    worker.postMessage("world body " + this.id + " type = " + stringify(this.data.type))
  },

  play: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    if (!worker) return
    worker.postMessage("world body " + this.id + " sleeping = false")
  },
  pause: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    if (!worker) return
    worker.postMessage("world body " + this.id + " sleeping = true")
  },

  remove: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    let bodies = this.el.sceneEl.systems.physics.bodies
    let movingBodies = this.el.sceneEl.systems.physics.movingBodies
    if (!worker) return
    bodies[this.id] = null
    if (this.mid !== null)
      movingBodies[this.mid] = null
    worker.postMessage("world body " + this.id + " remove")
  },

  tick: function () {
    let worker = this.el.sceneEl.systems.physics.worker
    let buffer = this.el.sceneEl.systems.physics.buffers[0]
    if (!worker) return
    if (this.mid !== null) {
      let p = this.mid * 8
      if (buffer.length <= p) return
      if (this.data.type === "kinematic") {
        let vec = this.el.object3D.getWorldPosition(THREE.Vector3.temp())
        buffer[p++] = vec.x
        buffer[p++] = vec.y
        buffer[p++] = vec.z
        p++
        let quat = this.el.object3D.getWorldQuaternion(THREE.Quaternion.temp())
        buffer[p++] = quat.x
        buffer[p++] = quat.y
        buffer[p++] = quat.z
        buffer[p++] = quat.w
      } else {
        let quat = THREE.Quaternion.temp()

        this.el.object3D.position.set(buffer[p++], buffer[p++], buffer[p++])
        this.el.object3D.parent.worldToLocal(this.el.object3D.position)
        p++

        this.el.object3D.getWorldQuaternion(quat)
        this.el.object3D.quaternion.multiply(quat.conjugate().normalize())
        quat.set(buffer[p++], buffer[p++], buffer[p++], buffer[p++])
        this.el.object3D.quaternion.multiply(quat.normalize())
        // console.log(this.el.tagName, "updated!", this.el.object3D.position)
      }
    }
  }
})

AFRAME.registerComponent("shape", {
  dependencies: ["body"],
  multiple: true,
  schema: {
    type: { type: "string", default: "box" },
    size: { type: "vec3", default: { x: -1, y: -1, z: -1 } },
    posOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    rotOffset: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    density: { type: "number", default: 1 },
    friction: { type: "number", default: 0.2 },
    restitution: { type: "number", default: 0.2 },
    belongsTo: { type: "int", default: 1 },
    collidesWith: { type: "int", default: 0xffffffff },
  },

  init: function () {
    this.body = this.el
    while (this.body && !this.body.matches("[body]")) this.body = this.body.parentElement
    this.bodyId = this.body.components.body.id

    let worker = this.el.sceneEl.systems.physics.worker
    let shapes = this.body.components.body.shapes
    if (!worker) return
    this.id = shapes.indexOf(null)
    if (this.id < 0) this.id = shapes.length
    shapes[this.id] = this.el

    let shape = {}
    shape.position = this.el.object3D.getWorldPosition(THREE.Vector3.temp())
    this.body.object3D.worldToLocal(shape.position)
    shape.quaternion = this.el.object3D.getWorldQuaternion(THREE.Quaternion.temp())
    let bodyquat = this.body.object3D.getWorldQuaternion(THREE.Quaternion.temp())
    shape.quaternion.multiply(bodyquat.conjugate().normalize()).normalize()
    shape.size = THREE.Vector3.temp().set(1, 1, 1)

    switch (this.el.tagName.toLowerCase()) {
      case "a-sphere":
        shape.type = "sphere"
        shape.size.multiplyScalar(parseFloat(this.el.getAttribute("radius") || 1) * 2)
        break
      case "a-cylinder":
        shape.type = "cylinder"
        shape.size.multiplyScalar(parseFloat(this.el.getAttribute("radius") || 1) * 2).y = parseFloat(this.el.getAttribute("height") || 1)
        break
      case "a-box":
        shape.type = "box"
        shape.size.set(
          parseFloat(this.el.getAttribute("width") || 1),
          parseFloat(this.el.getAttribute("height") || 1),
          parseFloat(this.el.getAttribute("depth") || 1)
        )
        break
      // case "a-plane":
      //   shape.type = "plane"
      //   break
    }

    worker.postMessage("world body " + this.bodyId + " shape " + this.id + " create " + stringify(shape))
  },

  update: function () {
  },

  remove: function () {
    let shapes = this.body.components.body.shapes
    worker.postMessage("world body " + this.bodyId + " shape " + this.id + " remove")
    shapes[this.id] = null
  }
})

AFRAME.registerComponent("joint", {
  dependencies: ["body", "shape"],

  schema: {
    type: { type: "string", default: "prisme" },
    with: { type: "selector", default: "[body]" },
    min: { type: "number", default: 0 },
    max: { type: "number", default: 0 },
    pos1: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    pos2: { type: "vec3", default: { x: 0, y: 0, z: 0 } },
    axe1: { type: "vec3", default: { x: 1, y: 0, z: 0 } },
    axe2: { type: "vec3", default: { x: 1, y: 0, z: 0 } },
    collision: { type: "boolean", default: false },
    limit: { type: "array" },
    motor: { type: "array" },
    spring: { type: "array" },
  },

  update: function () {
    if (!this.el.body) return setTimeout(() => this.update(), 256)
    if (!this.data.with.body) return setTimeout(() => this.update(), 256)
    if (!this.joint) {
      let jc = new OIMO.JointConfig()
      jc.body1 = this.el.body
      jc.body2 = this.data.with.body
      let deg2rad = Math.PI / 180
      switch (this.data.type) {
        case "distance":
          this.joint = new OIMO.DistanceJoint(jc, this.data.min, this.data.max)
          break
        case "hinge":
          this.joint = new OIMO.HingeJoint(jc, this.data.min * deg2rad, this.data.max * deg2rad)
          break
        case "prisme":
          this.joint = new OIMO.PrismaticJoint(jc, this.data.min * deg2rad, this.data.max * deg2rad)
          break
        case "slide":
          this.joint = new OIMO.SliderJoint(jc, this.data.min, this.data.max)
          break
        case "ball":
          this.joint = new OIMO.BallAndSocketJoint(jc)
          break
        case "wheel":
          this.joint = new OIMO.WheelJoint(jc)
          break
      }
      this.el.sceneEl.physicsWorld.addJoint(this.joint)
    }
    this.joint.localAnchorPoint1.copy(this.data.pos1)
    this.joint.localAnchorPoint2.copy(this.data.pos2)
    if (this.joint.localAxis1) {
      this.joint.localAxis1.copy(this.data.axe1)
      this.joint.localAxis2.copy(this.data.axe2)
    }
    this.joint.allowCollision = this.data.collision

    let lm = this.joint.rotationalLimitMotor1 || this.joint.limitMotor
    // if (this.data.limit.length == 2)
    lm.setLimit(parseFloat(this.data.limit[0]) || 0, parseFloat(this.data.limit[1]) || 0)
    // if (this.data.motor.length == 2)
    lm.setMotor(parseFloat(this.data.motor[0]) || 0, parseFloat(this.data.motor[1]) || 0)
    // if (this.data.spring.length == 2)
    lm.setSpring(parseFloat(this.data.spring[0]) || 0, parseFloat(this.data.spring[1]) || 0)
  },

  remove: function () {
    if (this.joint) {
      this.joint.body1.awake()
      this.joint.body2.awake()
      this.joint.remove()
    }
    this.joint = null
  },

})


},{}],3:[function(require,module,exports){
require("./libs/pools")
require("./libs/copyWorldPosRot")

require("./components/include")
require("./components/physics")

},{"./components/include":1,"./components/physics":2,"./libs/copyWorldPosRot":4,"./libs/pools":5}],4:[function(require,module,exports){
/* global AFRAME, THREE */

AFRAME.AEntity.prototype.copyWorldPosRot = function (srcEl) {
  let quat = THREE.Quaternion.temp()
  let src = srcEl.object3D
  let dest = this.object3D
  if (!src) return
  if (!dest) return
  if (!dest.parent) return
  src.getWorldPosition(dest.position)
  dest.parent.worldToLocal(dest.position)

  dest.getWorldQuaternion(quat)
  dest.quaternion.multiply(quat.conjugate().normalize())
  src.getWorldQuaternion(quat)
  dest.quaternion.multiply(quat.normalize())
}
},{}],5:[function(require,module,exports){
/* global AFRAME, THREE */

function makePool(Class) {
  Class._pool = []
  Class._inUse = []
  Class.temp = function () {
    let v = Class._pool.pop() || new Class()
    Class._inUse.push(v)
    if (!Class._gc)
      Class._gc = setTimeout(Class._recycle)
    return v
  }
  Class._recycle = function () {
    while (Class._inUse.length)
      Class._pool.push(Class._inUse.pop())
    Class._gc = false
  }
}

makePool(THREE.Vector2)
makePool(THREE.Vector3)
makePool(THREE.Quaternion)
makePool(THREE.Matrix3)
makePool(THREE.Matrix4)

},{}]},{},[3])
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIm5vZGVfbW9kdWxlcy9icm93c2VyLXBhY2svX3ByZWx1ZGUuanMiLCJzcmMvY29tcG9uZW50cy9pbmNsdWRlLmpzIiwic3JjL2NvbXBvbmVudHMvcGh5c2ljcy5qcyIsInNyYy9nYW1lZnJhbWUuanMiLCJzcmMvbGlicy9jb3B5V29ybGRQb3NSb3QuanMiLCJzcmMvbGlicy9wb29scy5qcyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTtBQ0FBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDbkJBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBOztBQzdVQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7O0FDTEE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTs7QUNoQkE7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0EiLCJmaWxlIjoiZ2VuZXJhdGVkLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXNDb250ZW50IjpbIihmdW5jdGlvbigpe2Z1bmN0aW9uIHIoZSxuLHQpe2Z1bmN0aW9uIG8oaSxmKXtpZighbltpXSl7aWYoIWVbaV0pe3ZhciBjPVwiZnVuY3Rpb25cIj09dHlwZW9mIHJlcXVpcmUmJnJlcXVpcmU7aWYoIWYmJmMpcmV0dXJuIGMoaSwhMCk7aWYodSlyZXR1cm4gdShpLCEwKTt2YXIgYT1uZXcgRXJyb3IoXCJDYW5ub3QgZmluZCBtb2R1bGUgJ1wiK2krXCInXCIpO3Rocm93IGEuY29kZT1cIk1PRFVMRV9OT1RfRk9VTkRcIixhfXZhciBwPW5baV09e2V4cG9ydHM6e319O2VbaV1bMF0uY2FsbChwLmV4cG9ydHMsZnVuY3Rpb24ocil7dmFyIG49ZVtpXVsxXVtyXTtyZXR1cm4gbyhufHxyKX0scCxwLmV4cG9ydHMscixlLG4sdCl9cmV0dXJuIG5baV0uZXhwb3J0c31mb3IodmFyIHU9XCJmdW5jdGlvblwiPT10eXBlb2YgcmVxdWlyZSYmcmVxdWlyZSxpPTA7aTx0Lmxlbmd0aDtpKyspbyh0W2ldKTtyZXR1cm4gb31yZXR1cm4gcn0pKCkiLCIvKiBnbG9iYWwgQUZSQU1FLCBUSFJFRSAqL1xuXG5sZXQgbG9hZGluZyA9IGZhbHNlXG5cbkFGUkFNRS5yZWdpc3RlckNvbXBvbmVudChcImluY2x1ZGVcIiwge1xuICBzY2hlbWE6IHsgdHlwZTogXCJzdHJpbmdcIiB9LFxuXG4gIHVwZGF0ZTogYXN5bmMgZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRhdGEgJiYgIWxvYWRpbmcpIHtcbiAgICAgIGxvYWRpbmcgPSB0cnVlXG4gICAgICBjb25zb2xlLmxvZyhcIkluY2x1ZGluZ1wiLCB0aGlzLmRhdGEpXG4gICAgICB0aGlzLmVsLm91dGVySFRNTCA9IGF3YWl0IChhd2FpdCBmZXRjaCh0aGlzLmRhdGEpKS50ZXh0KClcbiAgICAgIGxvYWRpbmcgPSBmYWxzZVxuICAgICAgbGV0IG5leHQgPSB0aGlzLmVsLnNjZW5lRWwucXVlcnlTZWxlY3RvcihcIltpbmNsdWRlXVwiKVxuICAgICAgaWYgKG5leHQpXG4gICAgICAgIG5leHQuY29tcG9uZW50cy5pbmNsdWRlLnVwZGF0ZSgpXG4gICAgfVxuICB9XG59KVxuIiwiLyogZ2xvYmFsIEFGUkFNRSwgVEhSRUUsIE9JTU8gKi9cblxuLy8gbGV0IHNjcmlwdHMgPSBkb2N1bWVudC5nZXRFbGVtZW50c0J5VGFnTmFtZShcInNjcmlwdFwiKVxuLy8gY29uc3Qgd29ya2VyVXJsID0gc2NyaXB0c1tzY3JpcHRzLmxlbmd0aCAtIDFdLnNyY1xuXG5mdW5jdGlvbiBzdHJpbmdpZnkodmFsKSB7XG4gIHJldHVybiBKU09OLnN0cmluZ2lmeSh2YWwpLnJlcGxhY2VBbGwoXCIgXCIsIFwiXFxcXHUwMDIwXCIpLnJlcGxhY2VBbGwoXCJcXFwiX1wiLCBcIlxcXCJcIilcbn1cblxuQUZSQU1FLnJlZ2lzdGVyU3lzdGVtKFwicGh5c2ljc1wiLCB7XG4gIHNjaGVtYToge1xuICAgIHdvcmtlclVybDogeyB0eXBlOiBcInN0cmluZ1wiIH0sXG4gICAgZ3Jhdml0eTogeyB0eXBlOiBcInZlYzNcIiwgZGVmYXVsdDogeyB4OiAwLCB5OiAtOS44LCB6OiAwIH0gfSxcbiAgICBkZWJ1ZzogeyB0eXBlOiBcImJvb2xlYW5cIiwgZGVmYXVsdDogZmFsc2UgfVxuICB9LFxuXG4gIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgIGlmICh0aGlzLmRhdGEud29ya2VyVXJsKSB7XG4gICAgICBpZiAoIXRoaXMud29ya2VyKSB7XG4gICAgICAgIHRoaXMud29ya2VyID0gbmV3IFdvcmtlcih0aGlzLmRhdGEud29ya2VyVXJsKVxuICAgICAgICB0aGlzLndvcmtlci5hZGRFdmVudExpc3RlbmVyKFwibWVzc2FnZVwiLCB0aGlzLm9uTWVzc2FnZS5iaW5kKHRoaXMpKVxuICAgICAgfVxuICAgICAgdGhpcy5ib2RpZXMgPSB0aGlzLmJvZGllcyB8fCBbXVxuICAgICAgdGhpcy5tb3ZpbmdCb2RpZXMgPSB0aGlzLm1vdmluZ0JvZGllcyB8fCBbXVxuICAgICAgdGhpcy5idWZmZXJzID0gW25ldyBGbG9hdDY0QXJyYXkoOCksIG5ldyBGbG9hdDY0QXJyYXkoOCldXG4gICAgICB0aGlzLndvcmtlci5wb3N0TWVzc2FnZShcIndvcmxkIGdyYXZpdHkgPSBcIiArIHN0cmluZ2lmeSh0aGlzLmRhdGEuZ3Jhdml0eSkpXG4gICAgICB0aGlzLl9kZWJ1ZyA9IHRoaXMuZGF0YS5kZWJ1Z1xuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLnJlbW92ZSgpXG4gICAgfVxuICB9LFxuXG4gIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMud29ya2VyICYmIHRoaXMud29ya2VyLnRlcm1pbmF0ZSgpXG4gICAgdGhpcy53b3JrZXIgPSBudWxsXG4gICAgdGhpcy5ib2RpZXMgPSBbXVxuICAgIHRoaXMubW92aW5nQm9kaWVzID0gW11cbiAgfSxcblxuICB0aWNrOiBmdW5jdGlvbiAodGltZSwgdGltZURlbHRhKSB7XG4gICAgaWYgKCF0aGlzLndvcmtlcikgcmV0dXJuXG4gICAgaWYgKHRoaXMuYnVmZmVycy5sZW5ndGggPCAyKSByZXR1cm5cbiAgICBsZXQgYnVmZmVyID0gdGhpcy5idWZmZXJzLnNoaWZ0KClcbiAgICBpZiAoYnVmZmVyLmxlbmd0aCA8IDggKiB0aGlzLm1vdmluZ0JvZGllcy5sZW5ndGgpIHtcbiAgICAgIGxldCBsZW4gPSBidWZmZXIubGVuZ3RoXG4gICAgICB3aGlsZSAobGVuIDwgOCAqIHRoaXMubW92aW5nQm9kaWVzLmxlbmd0aCkge1xuICAgICAgICBsZW4gKj0gMlxuICAgICAgfVxuICAgICAgbGV0IGJvZHMgPSB0aGlzLm1vdmluZ0JvZGllc1xuICAgICAgbGV0IGIgPSBuZXcgRmxvYXQ2NEFycmF5KGxlbilcbiAgICAgIGxldCB2ZWMgPSBUSFJFRS5WZWN0b3IzLnRlbXAoKVxuICAgICAgbGV0IHF1YXQgPSBUSFJFRS5RdWF0ZXJuaW9uLnRlbXAoKVxuICAgICAgYi5zZXQoYnVmZmVyKVxuICAgICAgZm9yIChsZXQgaSA9IGJ1ZmZlci5sZW5ndGggLyA4OyBpIDwgYm9kcy5sZW5ndGg7IGkrKykge1xuICAgICAgICBsZXQgcCA9IGkgKiA4XG4gICAgICAgIGlmIChib2RzW2ldKSB7XG4gICAgICAgICAgYm9kc1tpXS5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKHZlYylcbiAgICAgICAgICBiW3ArK10gPSB2ZWMueFxuICAgICAgICAgIGJbcCsrXSA9IHZlYy55XG4gICAgICAgICAgYltwKytdID0gdmVjLnpcbiAgICAgICAgICBwKytcbiAgICAgICAgICBib2RzW2ldLm9iamVjdDNELmdldFdvcmxkUXVhdGVybmlvbihxdWF0KVxuICAgICAgICAgIGJbcCsrXSA9IHF1YXQueFxuICAgICAgICAgIGJbcCsrXSA9IHF1YXQueVxuICAgICAgICAgIGJbcCsrXSA9IHF1YXQuelxuICAgICAgICAgIGJbcCsrXSA9IHF1YXQud1xuICAgICAgICB9XG4gICAgICB9XG4gICAgICBidWZmZXIgPSBiXG4gICAgfVxuICAgIHRoaXMud29ya2VyLnBvc3RNZXNzYWdlKGJ1ZmZlciwgW2J1ZmZlci5idWZmZXJdKVxuICB9LFxuXG4gIG9uTWVzc2FnZTogZnVuY3Rpb24gKGUpIHtcbiAgICBpZiAoZS5kYXRhIGluc3RhbmNlb2YgRmxvYXQ2NEFycmF5KSB7XG4gICAgICB0aGlzLmJ1ZmZlcnMucHVzaChlLmRhdGEpXG4gICAgICB3aGlsZSAodGhpcy5idWZmZXJzLmxlbmd0aCA+IDIpXG4gICAgICAgIHRoaXMuYnVmZmVycy5zaGlmdCgpXG4gICAgfVxuICB9XG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoXCJib2R5XCIsIHtcbiAgZGVwZW5kZW5jaWVzOiBbXCJwb3NpdGlvblwiLCBcInJvdGF0aW9uXCIsIFwic2NhbGVcIl0sXG5cbiAgc2NoZW1hOiB7XG4gICAgdHlwZTogeyB0eXBlOiBcInN0cmluZ1wiLCBkZWZhdWx0OiBcInN0YXRpY1wiIH1cbiAgfSxcblxuICBpbml0OiBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IHdvcmtlciA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3Mud29ya2VyXG4gICAgbGV0IGJvZGllcyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3MuYm9kaWVzXG4gICAgbGV0IG1vdmluZ0JvZGllcyA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3MubW92aW5nQm9kaWVzXG4gICAgbGV0IGJ1ZmZlciA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3MuYnVmZmVyc1swXVxuICAgIGlmICghd29ya2VyKSByZXR1cm5cbiAgICB0aGlzLmlkID0gYm9kaWVzLmluZGV4T2YobnVsbClcbiAgICBpZiAodGhpcy5pZCA8IDApIHRoaXMuaWQgPSBib2RpZXMubGVuZ3RoXG4gICAgYm9kaWVzW3RoaXMuaWRdID0gdGhpcy5lbFxuICAgIGlmICh0aGlzLmRhdGEudHlwZSAhPT0gXCJzdGF0aWNcIikge1xuICAgICAgdGhpcy5taWQgPSBtb3ZpbmdCb2RpZXMuaW5kZXhPZihudWxsKVxuICAgICAgaWYgKHRoaXMubWlkIDwgMCkgdGhpcy5taWQgPSBtb3ZpbmdCb2RpZXMubGVuZ3RoXG4gICAgICBtb3ZpbmdCb2RpZXNbdGhpcy5taWRdID0gdGhpcy5lbFxuICAgIH0gZWxzZSB7XG4gICAgICB0aGlzLm1pZCA9IG51bGxcbiAgICB9XG4gICAgbGV0IGJvZHkgPSB7IG1pZDogdGhpcy5taWQgfVxuICAgIGJvZHkudHlwZSA9IHRoaXMuZGF0YS50eXBlXG4gICAgYm9keS5wb3NpdGlvbiA9IHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbihUSFJFRS5WZWN0b3IzLnRlbXAoKSlcbiAgICBib2R5LnF1YXRlcm5pb24gPSB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUXVhdGVybmlvbihUSFJFRS5RdWF0ZXJuaW9uLnRlbXAoKSlcbiAgICBpZiAodGhpcy5taWQgIT09IG51bGwpIHtcbiAgICAgIGxldCBwID0gdGhpcy5taWQgKiA4XG4gICAgICBidWZmZXJbcCsrXSA9IGJvZHkucG9zaXRpb24ueFxuICAgICAgYnVmZmVyW3ArK10gPSBib2R5LnBvc2l0aW9uLnlcbiAgICAgIGJ1ZmZlcltwKytdID0gYm9keS5wb3NpdGlvbi56XG4gICAgICBwKytcbiAgICAgIGJ1ZmZlcltwKytdID0gYm9keS5xdWF0ZXJuaW9uLnhcbiAgICAgIGJ1ZmZlcltwKytdID0gYm9keS5xdWF0ZXJuaW9uLnlcbiAgICAgIGJ1ZmZlcltwKytdID0gYm9keS5xdWF0ZXJuaW9uLnpcbiAgICAgIGJ1ZmZlcltwKytdID0gYm9keS5xdWF0ZXJuaW9uLndcbiAgICB9XG4gICAgdGhpcy5zaGFwZXMgPSBbXVxuICAgIHdvcmtlci5wb3N0TWVzc2FnZShcIndvcmxkIGJvZHkgXCIgKyB0aGlzLmlkICsgXCIgY3JlYXRlIFwiICsgc3RyaW5naWZ5KGJvZHkpKVxuICB9LFxuXG4gIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICAgIGxldCB3b3JrZXIgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5waHlzaWNzLndvcmtlclxuICAgIGlmICghd29ya2VyKSByZXR1cm5cbiAgICB3b3JrZXIucG9zdE1lc3NhZ2UoXCJ3b3JsZCBib2R5IFwiICsgdGhpcy5pZCArIFwiIHR5cGUgPSBcIiArIHN0cmluZ2lmeSh0aGlzLmRhdGEudHlwZSkpXG4gIH0sXG5cbiAgcGxheTogZnVuY3Rpb24gKCkge1xuICAgIGxldCB3b3JrZXIgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5waHlzaWNzLndvcmtlclxuICAgIGlmICghd29ya2VyKSByZXR1cm5cbiAgICB3b3JrZXIucG9zdE1lc3NhZ2UoXCJ3b3JsZCBib2R5IFwiICsgdGhpcy5pZCArIFwiIHNsZWVwaW5nID0gZmFsc2VcIilcbiAgfSxcbiAgcGF1c2U6IGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgd29ya2VyID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMucGh5c2ljcy53b3JrZXJcbiAgICBpZiAoIXdvcmtlcikgcmV0dXJuXG4gICAgd29ya2VyLnBvc3RNZXNzYWdlKFwid29ybGQgYm9keSBcIiArIHRoaXMuaWQgKyBcIiBzbGVlcGluZyA9IHRydWVcIilcbiAgfSxcblxuICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICBsZXQgd29ya2VyID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMucGh5c2ljcy53b3JrZXJcbiAgICBsZXQgYm9kaWVzID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMucGh5c2ljcy5ib2RpZXNcbiAgICBsZXQgbW92aW5nQm9kaWVzID0gdGhpcy5lbC5zY2VuZUVsLnN5c3RlbXMucGh5c2ljcy5tb3ZpbmdCb2RpZXNcbiAgICBpZiAoIXdvcmtlcikgcmV0dXJuXG4gICAgYm9kaWVzW3RoaXMuaWRdID0gbnVsbFxuICAgIGlmICh0aGlzLm1pZCAhPT0gbnVsbClcbiAgICAgIG1vdmluZ0JvZGllc1t0aGlzLm1pZF0gPSBudWxsXG4gICAgd29ya2VyLnBvc3RNZXNzYWdlKFwid29ybGQgYm9keSBcIiArIHRoaXMuaWQgKyBcIiByZW1vdmVcIilcbiAgfSxcblxuICB0aWNrOiBmdW5jdGlvbiAoKSB7XG4gICAgbGV0IHdvcmtlciA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3Mud29ya2VyXG4gICAgbGV0IGJ1ZmZlciA9IHRoaXMuZWwuc2NlbmVFbC5zeXN0ZW1zLnBoeXNpY3MuYnVmZmVyc1swXVxuICAgIGlmICghd29ya2VyKSByZXR1cm5cbiAgICBpZiAodGhpcy5taWQgIT09IG51bGwpIHtcbiAgICAgIGxldCBwID0gdGhpcy5taWQgKiA4XG4gICAgICBpZiAoYnVmZmVyLmxlbmd0aCA8PSBwKSByZXR1cm5cbiAgICAgIGlmICh0aGlzLmRhdGEudHlwZSA9PT0gXCJraW5lbWF0aWNcIikge1xuICAgICAgICBsZXQgdmVjID0gdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFBvc2l0aW9uKFRIUkVFLlZlY3RvcjMudGVtcCgpKVxuICAgICAgICBidWZmZXJbcCsrXSA9IHZlYy54XG4gICAgICAgIGJ1ZmZlcltwKytdID0gdmVjLnlcbiAgICAgICAgYnVmZmVyW3ArK10gPSB2ZWMuelxuICAgICAgICBwKytcbiAgICAgICAgbGV0IHF1YXQgPSB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUXVhdGVybmlvbihUSFJFRS5RdWF0ZXJuaW9uLnRlbXAoKSlcbiAgICAgICAgYnVmZmVyW3ArK10gPSBxdWF0LnhcbiAgICAgICAgYnVmZmVyW3ArK10gPSBxdWF0LnlcbiAgICAgICAgYnVmZmVyW3ArK10gPSBxdWF0LnpcbiAgICAgICAgYnVmZmVyW3ArK10gPSBxdWF0LndcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxldCBxdWF0ID0gVEhSRUUuUXVhdGVybmlvbi50ZW1wKClcblxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnBvc2l0aW9uLnNldChidWZmZXJbcCsrXSwgYnVmZmVyW3ArK10sIGJ1ZmZlcltwKytdKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnBhcmVudC53b3JsZFRvTG9jYWwodGhpcy5lbC5vYmplY3QzRC5wb3NpdGlvbilcbiAgICAgICAgcCsrXG5cbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5nZXRXb3JsZFF1YXRlcm5pb24ocXVhdClcbiAgICAgICAgdGhpcy5lbC5vYmplY3QzRC5xdWF0ZXJuaW9uLm11bHRpcGx5KHF1YXQuY29uanVnYXRlKCkubm9ybWFsaXplKCkpXG4gICAgICAgIHF1YXQuc2V0KGJ1ZmZlcltwKytdLCBidWZmZXJbcCsrXSwgYnVmZmVyW3ArK10sIGJ1ZmZlcltwKytdKVxuICAgICAgICB0aGlzLmVsLm9iamVjdDNELnF1YXRlcm5pb24ubXVsdGlwbHkocXVhdC5ub3JtYWxpemUoKSlcbiAgICAgICAgLy8gY29uc29sZS5sb2codGhpcy5lbC50YWdOYW1lLCBcInVwZGF0ZWQhXCIsIHRoaXMuZWwub2JqZWN0M0QucG9zaXRpb24pXG4gICAgICB9XG4gICAgfVxuICB9XG59KVxuXG5BRlJBTUUucmVnaXN0ZXJDb21wb25lbnQoXCJzaGFwZVwiLCB7XG4gIGRlcGVuZGVuY2llczogW1wiYm9keVwiXSxcbiAgbXVsdGlwbGU6IHRydWUsXG4gIHNjaGVtYToge1xuICAgIHR5cGU6IHsgdHlwZTogXCJzdHJpbmdcIiwgZGVmYXVsdDogXCJib3hcIiB9LFxuICAgIHNpemU6IHsgdHlwZTogXCJ2ZWMzXCIsIGRlZmF1bHQ6IHsgeDogLTEsIHk6IC0xLCB6OiAtMSB9IH0sXG4gICAgcG9zT2Zmc2V0OiB7IHR5cGU6IFwidmVjM1wiLCBkZWZhdWx0OiB7IHg6IDAsIHk6IDAsIHo6IDAgfSB9LFxuICAgIHJvdE9mZnNldDogeyB0eXBlOiBcInZlYzNcIiwgZGVmYXVsdDogeyB4OiAwLCB5OiAwLCB6OiAwIH0gfSxcbiAgICBkZW5zaXR5OiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IDEgfSxcbiAgICBmcmljdGlvbjogeyB0eXBlOiBcIm51bWJlclwiLCBkZWZhdWx0OiAwLjIgfSxcbiAgICByZXN0aXR1dGlvbjogeyB0eXBlOiBcIm51bWJlclwiLCBkZWZhdWx0OiAwLjIgfSxcbiAgICBiZWxvbmdzVG86IHsgdHlwZTogXCJpbnRcIiwgZGVmYXVsdDogMSB9LFxuICAgIGNvbGxpZGVzV2l0aDogeyB0eXBlOiBcImludFwiLCBkZWZhdWx0OiAweGZmZmZmZmZmIH0sXG4gIH0sXG5cbiAgaW5pdDogZnVuY3Rpb24gKCkge1xuICAgIHRoaXMuYm9keSA9IHRoaXMuZWxcbiAgICB3aGlsZSAodGhpcy5ib2R5ICYmICF0aGlzLmJvZHkubWF0Y2hlcyhcIltib2R5XVwiKSkgdGhpcy5ib2R5ID0gdGhpcy5ib2R5LnBhcmVudEVsZW1lbnRcbiAgICB0aGlzLmJvZHlJZCA9IHRoaXMuYm9keS5jb21wb25lbnRzLmJvZHkuaWRcblxuICAgIGxldCB3b3JrZXIgPSB0aGlzLmVsLnNjZW5lRWwuc3lzdGVtcy5waHlzaWNzLndvcmtlclxuICAgIGxldCBzaGFwZXMgPSB0aGlzLmJvZHkuY29tcG9uZW50cy5ib2R5LnNoYXBlc1xuICAgIGlmICghd29ya2VyKSByZXR1cm5cbiAgICB0aGlzLmlkID0gc2hhcGVzLmluZGV4T2YobnVsbClcbiAgICBpZiAodGhpcy5pZCA8IDApIHRoaXMuaWQgPSBzaGFwZXMubGVuZ3RoXG4gICAgc2hhcGVzW3RoaXMuaWRdID0gdGhpcy5lbFxuXG4gICAgbGV0IHNoYXBlID0ge31cbiAgICBzaGFwZS5wb3NpdGlvbiA9IHRoaXMuZWwub2JqZWN0M0QuZ2V0V29ybGRQb3NpdGlvbihUSFJFRS5WZWN0b3IzLnRlbXAoKSlcbiAgICB0aGlzLmJvZHkub2JqZWN0M0Qud29ybGRUb0xvY2FsKHNoYXBlLnBvc2l0aW9uKVxuICAgIHNoYXBlLnF1YXRlcm5pb24gPSB0aGlzLmVsLm9iamVjdDNELmdldFdvcmxkUXVhdGVybmlvbihUSFJFRS5RdWF0ZXJuaW9uLnRlbXAoKSlcbiAgICBsZXQgYm9keXF1YXQgPSB0aGlzLmJvZHkub2JqZWN0M0QuZ2V0V29ybGRRdWF0ZXJuaW9uKFRIUkVFLlF1YXRlcm5pb24udGVtcCgpKVxuICAgIHNoYXBlLnF1YXRlcm5pb24ubXVsdGlwbHkoYm9keXF1YXQuY29uanVnYXRlKCkubm9ybWFsaXplKCkpLm5vcm1hbGl6ZSgpXG4gICAgc2hhcGUuc2l6ZSA9IFRIUkVFLlZlY3RvcjMudGVtcCgpLnNldCgxLCAxLCAxKVxuXG4gICAgc3dpdGNoICh0aGlzLmVsLnRhZ05hbWUudG9Mb3dlckNhc2UoKSkge1xuICAgICAgY2FzZSBcImEtc3BoZXJlXCI6XG4gICAgICAgIHNoYXBlLnR5cGUgPSBcInNwaGVyZVwiXG4gICAgICAgIHNoYXBlLnNpemUubXVsdGlwbHlTY2FsYXIocGFyc2VGbG9hdCh0aGlzLmVsLmdldEF0dHJpYnV0ZShcInJhZGl1c1wiKSB8fCAxKSAqIDIpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIFwiYS1jeWxpbmRlclwiOlxuICAgICAgICBzaGFwZS50eXBlID0gXCJjeWxpbmRlclwiXG4gICAgICAgIHNoYXBlLnNpemUubXVsdGlwbHlTY2FsYXIocGFyc2VGbG9hdCh0aGlzLmVsLmdldEF0dHJpYnV0ZShcInJhZGl1c1wiKSB8fCAxKSAqIDIpLnkgPSBwYXJzZUZsb2F0KHRoaXMuZWwuZ2V0QXR0cmlidXRlKFwiaGVpZ2h0XCIpIHx8IDEpXG4gICAgICAgIGJyZWFrXG4gICAgICBjYXNlIFwiYS1ib3hcIjpcbiAgICAgICAgc2hhcGUudHlwZSA9IFwiYm94XCJcbiAgICAgICAgc2hhcGUuc2l6ZS5zZXQoXG4gICAgICAgICAgcGFyc2VGbG9hdCh0aGlzLmVsLmdldEF0dHJpYnV0ZShcIndpZHRoXCIpIHx8IDEpLFxuICAgICAgICAgIHBhcnNlRmxvYXQodGhpcy5lbC5nZXRBdHRyaWJ1dGUoXCJoZWlnaHRcIikgfHwgMSksXG4gICAgICAgICAgcGFyc2VGbG9hdCh0aGlzLmVsLmdldEF0dHJpYnV0ZShcImRlcHRoXCIpIHx8IDEpXG4gICAgICAgIClcbiAgICAgICAgYnJlYWtcbiAgICAgIC8vIGNhc2UgXCJhLXBsYW5lXCI6XG4gICAgICAvLyAgIHNoYXBlLnR5cGUgPSBcInBsYW5lXCJcbiAgICAgIC8vICAgYnJlYWtcbiAgICB9XG5cbiAgICB3b3JrZXIucG9zdE1lc3NhZ2UoXCJ3b3JsZCBib2R5IFwiICsgdGhpcy5ib2R5SWQgKyBcIiBzaGFwZSBcIiArIHRoaXMuaWQgKyBcIiBjcmVhdGUgXCIgKyBzdHJpbmdpZnkoc2hhcGUpKVxuICB9LFxuXG4gIHVwZGF0ZTogZnVuY3Rpb24gKCkge1xuICB9LFxuXG4gIHJlbW92ZTogZnVuY3Rpb24gKCkge1xuICAgIGxldCBzaGFwZXMgPSB0aGlzLmJvZHkuY29tcG9uZW50cy5ib2R5LnNoYXBlc1xuICAgIHdvcmtlci5wb3N0TWVzc2FnZShcIndvcmxkIGJvZHkgXCIgKyB0aGlzLmJvZHlJZCArIFwiIHNoYXBlIFwiICsgdGhpcy5pZCArIFwiIHJlbW92ZVwiKVxuICAgIHNoYXBlc1t0aGlzLmlkXSA9IG51bGxcbiAgfVxufSlcblxuQUZSQU1FLnJlZ2lzdGVyQ29tcG9uZW50KFwiam9pbnRcIiwge1xuICBkZXBlbmRlbmNpZXM6IFtcImJvZHlcIiwgXCJzaGFwZVwiXSxcblxuICBzY2hlbWE6IHtcbiAgICB0eXBlOiB7IHR5cGU6IFwic3RyaW5nXCIsIGRlZmF1bHQ6IFwicHJpc21lXCIgfSxcbiAgICB3aXRoOiB7IHR5cGU6IFwic2VsZWN0b3JcIiwgZGVmYXVsdDogXCJbYm9keV1cIiB9LFxuICAgIG1pbjogeyB0eXBlOiBcIm51bWJlclwiLCBkZWZhdWx0OiAwIH0sXG4gICAgbWF4OiB7IHR5cGU6IFwibnVtYmVyXCIsIGRlZmF1bHQ6IDAgfSxcbiAgICBwb3MxOiB7IHR5cGU6IFwidmVjM1wiLCBkZWZhdWx0OiB7IHg6IDAsIHk6IDAsIHo6IDAgfSB9LFxuICAgIHBvczI6IHsgdHlwZTogXCJ2ZWMzXCIsIGRlZmF1bHQ6IHsgeDogMCwgeTogMCwgejogMCB9IH0sXG4gICAgYXhlMTogeyB0eXBlOiBcInZlYzNcIiwgZGVmYXVsdDogeyB4OiAxLCB5OiAwLCB6OiAwIH0gfSxcbiAgICBheGUyOiB7IHR5cGU6IFwidmVjM1wiLCBkZWZhdWx0OiB7IHg6IDEsIHk6IDAsIHo6IDAgfSB9LFxuICAgIGNvbGxpc2lvbjogeyB0eXBlOiBcImJvb2xlYW5cIiwgZGVmYXVsdDogZmFsc2UgfSxcbiAgICBsaW1pdDogeyB0eXBlOiBcImFycmF5XCIgfSxcbiAgICBtb3RvcjogeyB0eXBlOiBcImFycmF5XCIgfSxcbiAgICBzcHJpbmc6IHsgdHlwZTogXCJhcnJheVwiIH0sXG4gIH0sXG5cbiAgdXBkYXRlOiBmdW5jdGlvbiAoKSB7XG4gICAgaWYgKCF0aGlzLmVsLmJvZHkpIHJldHVybiBzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlKCksIDI1NilcbiAgICBpZiAoIXRoaXMuZGF0YS53aXRoLmJvZHkpIHJldHVybiBzZXRUaW1lb3V0KCgpID0+IHRoaXMudXBkYXRlKCksIDI1NilcbiAgICBpZiAoIXRoaXMuam9pbnQpIHtcbiAgICAgIGxldCBqYyA9IG5ldyBPSU1PLkpvaW50Q29uZmlnKClcbiAgICAgIGpjLmJvZHkxID0gdGhpcy5lbC5ib2R5XG4gICAgICBqYy5ib2R5MiA9IHRoaXMuZGF0YS53aXRoLmJvZHlcbiAgICAgIGxldCBkZWcycmFkID0gTWF0aC5QSSAvIDE4MFxuICAgICAgc3dpdGNoICh0aGlzLmRhdGEudHlwZSkge1xuICAgICAgICBjYXNlIFwiZGlzdGFuY2VcIjpcbiAgICAgICAgICB0aGlzLmpvaW50ID0gbmV3IE9JTU8uRGlzdGFuY2VKb2ludChqYywgdGhpcy5kYXRhLm1pbiwgdGhpcy5kYXRhLm1heClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIFwiaGluZ2VcIjpcbiAgICAgICAgICB0aGlzLmpvaW50ID0gbmV3IE9JTU8uSGluZ2VKb2ludChqYywgdGhpcy5kYXRhLm1pbiAqIGRlZzJyYWQsIHRoaXMuZGF0YS5tYXggKiBkZWcycmFkKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgXCJwcmlzbWVcIjpcbiAgICAgICAgICB0aGlzLmpvaW50ID0gbmV3IE9JTU8uUHJpc21hdGljSm9pbnQoamMsIHRoaXMuZGF0YS5taW4gKiBkZWcycmFkLCB0aGlzLmRhdGEubWF4ICogZGVnMnJhZClcbiAgICAgICAgICBicmVha1xuICAgICAgICBjYXNlIFwic2xpZGVcIjpcbiAgICAgICAgICB0aGlzLmpvaW50ID0gbmV3IE9JTU8uU2xpZGVySm9pbnQoamMsIHRoaXMuZGF0YS5taW4sIHRoaXMuZGF0YS5tYXgpXG4gICAgICAgICAgYnJlYWtcbiAgICAgICAgY2FzZSBcImJhbGxcIjpcbiAgICAgICAgICB0aGlzLmpvaW50ID0gbmV3IE9JTU8uQmFsbEFuZFNvY2tldEpvaW50KGpjKVxuICAgICAgICAgIGJyZWFrXG4gICAgICAgIGNhc2UgXCJ3aGVlbFwiOlxuICAgICAgICAgIHRoaXMuam9pbnQgPSBuZXcgT0lNTy5XaGVlbEpvaW50KGpjKVxuICAgICAgICAgIGJyZWFrXG4gICAgICB9XG4gICAgICB0aGlzLmVsLnNjZW5lRWwucGh5c2ljc1dvcmxkLmFkZEpvaW50KHRoaXMuam9pbnQpXG4gICAgfVxuICAgIHRoaXMuam9pbnQubG9jYWxBbmNob3JQb2ludDEuY29weSh0aGlzLmRhdGEucG9zMSlcbiAgICB0aGlzLmpvaW50LmxvY2FsQW5jaG9yUG9pbnQyLmNvcHkodGhpcy5kYXRhLnBvczIpXG4gICAgaWYgKHRoaXMuam9pbnQubG9jYWxBeGlzMSkge1xuICAgICAgdGhpcy5qb2ludC5sb2NhbEF4aXMxLmNvcHkodGhpcy5kYXRhLmF4ZTEpXG4gICAgICB0aGlzLmpvaW50LmxvY2FsQXhpczIuY29weSh0aGlzLmRhdGEuYXhlMilcbiAgICB9XG4gICAgdGhpcy5qb2ludC5hbGxvd0NvbGxpc2lvbiA9IHRoaXMuZGF0YS5jb2xsaXNpb25cblxuICAgIGxldCBsbSA9IHRoaXMuam9pbnQucm90YXRpb25hbExpbWl0TW90b3IxIHx8IHRoaXMuam9pbnQubGltaXRNb3RvclxuICAgIC8vIGlmICh0aGlzLmRhdGEubGltaXQubGVuZ3RoID09IDIpXG4gICAgbG0uc2V0TGltaXQocGFyc2VGbG9hdCh0aGlzLmRhdGEubGltaXRbMF0pIHx8IDAsIHBhcnNlRmxvYXQodGhpcy5kYXRhLmxpbWl0WzFdKSB8fCAwKVxuICAgIC8vIGlmICh0aGlzLmRhdGEubW90b3IubGVuZ3RoID09IDIpXG4gICAgbG0uc2V0TW90b3IocGFyc2VGbG9hdCh0aGlzLmRhdGEubW90b3JbMF0pIHx8IDAsIHBhcnNlRmxvYXQodGhpcy5kYXRhLm1vdG9yWzFdKSB8fCAwKVxuICAgIC8vIGlmICh0aGlzLmRhdGEuc3ByaW5nLmxlbmd0aCA9PSAyKVxuICAgIGxtLnNldFNwcmluZyhwYXJzZUZsb2F0KHRoaXMuZGF0YS5zcHJpbmdbMF0pIHx8IDAsIHBhcnNlRmxvYXQodGhpcy5kYXRhLnNwcmluZ1sxXSkgfHwgMClcbiAgfSxcblxuICByZW1vdmU6IGZ1bmN0aW9uICgpIHtcbiAgICBpZiAodGhpcy5qb2ludCkge1xuICAgICAgdGhpcy5qb2ludC5ib2R5MS5hd2FrZSgpXG4gICAgICB0aGlzLmpvaW50LmJvZHkyLmF3YWtlKClcbiAgICAgIHRoaXMuam9pbnQucmVtb3ZlKClcbiAgICB9XG4gICAgdGhpcy5qb2ludCA9IG51bGxcbiAgfSxcblxufSlcblxuIiwicmVxdWlyZShcIi4vbGlicy9wb29sc1wiKVxyXG5yZXF1aXJlKFwiLi9saWJzL2NvcHlXb3JsZFBvc1JvdFwiKVxyXG5cclxucmVxdWlyZShcIi4vY29tcG9uZW50cy9pbmNsdWRlXCIpXHJcbnJlcXVpcmUoXCIuL2NvbXBvbmVudHMvcGh5c2ljc1wiKVxyXG4iLCIvKiBnbG9iYWwgQUZSQU1FLCBUSFJFRSAqL1xyXG5cclxuQUZSQU1FLkFFbnRpdHkucHJvdG90eXBlLmNvcHlXb3JsZFBvc1JvdCA9IGZ1bmN0aW9uIChzcmNFbCkge1xyXG4gIGxldCBxdWF0ID0gVEhSRUUuUXVhdGVybmlvbi50ZW1wKClcclxuICBsZXQgc3JjID0gc3JjRWwub2JqZWN0M0RcclxuICBsZXQgZGVzdCA9IHRoaXMub2JqZWN0M0RcclxuICBpZiAoIXNyYykgcmV0dXJuXHJcbiAgaWYgKCFkZXN0KSByZXR1cm5cclxuICBpZiAoIWRlc3QucGFyZW50KSByZXR1cm5cclxuICBzcmMuZ2V0V29ybGRQb3NpdGlvbihkZXN0LnBvc2l0aW9uKVxyXG4gIGRlc3QucGFyZW50LndvcmxkVG9Mb2NhbChkZXN0LnBvc2l0aW9uKVxyXG5cclxuICBkZXN0LmdldFdvcmxkUXVhdGVybmlvbihxdWF0KVxyXG4gIGRlc3QucXVhdGVybmlvbi5tdWx0aXBseShxdWF0LmNvbmp1Z2F0ZSgpLm5vcm1hbGl6ZSgpKVxyXG4gIHNyYy5nZXRXb3JsZFF1YXRlcm5pb24ocXVhdClcclxuICBkZXN0LnF1YXRlcm5pb24ubXVsdGlwbHkocXVhdC5ub3JtYWxpemUoKSlcclxufSIsIi8qIGdsb2JhbCBBRlJBTUUsIFRIUkVFICovXHJcblxyXG5mdW5jdGlvbiBtYWtlUG9vbChDbGFzcykge1xyXG4gIENsYXNzLl9wb29sID0gW11cclxuICBDbGFzcy5faW5Vc2UgPSBbXVxyXG4gIENsYXNzLnRlbXAgPSBmdW5jdGlvbiAoKSB7XHJcbiAgICBsZXQgdiA9IENsYXNzLl9wb29sLnBvcCgpIHx8IG5ldyBDbGFzcygpXHJcbiAgICBDbGFzcy5faW5Vc2UucHVzaCh2KVxyXG4gICAgaWYgKCFDbGFzcy5fZ2MpXHJcbiAgICAgIENsYXNzLl9nYyA9IHNldFRpbWVvdXQoQ2xhc3MuX3JlY3ljbGUpXHJcbiAgICByZXR1cm4gdlxyXG4gIH1cclxuICBDbGFzcy5fcmVjeWNsZSA9IGZ1bmN0aW9uICgpIHtcclxuICAgIHdoaWxlIChDbGFzcy5faW5Vc2UubGVuZ3RoKVxyXG4gICAgICBDbGFzcy5fcG9vbC5wdXNoKENsYXNzLl9pblVzZS5wb3AoKSlcclxuICAgIENsYXNzLl9nYyA9IGZhbHNlXHJcbiAgfVxyXG59XHJcblxyXG5tYWtlUG9vbChUSFJFRS5WZWN0b3IyKVxyXG5tYWtlUG9vbChUSFJFRS5WZWN0b3IzKVxyXG5tYWtlUG9vbChUSFJFRS5RdWF0ZXJuaW9uKVxyXG5tYWtlUG9vbChUSFJFRS5NYXRyaXgzKVxyXG5tYWtlUG9vbChUSFJFRS5NYXRyaXg0KVxyXG4iXX0=
