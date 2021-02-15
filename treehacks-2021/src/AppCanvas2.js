
import React, { Component, useState, Suspense, useRef } from 'react'
import { Canvas, useFrame, useThree, useUpdate, useLoader } from 'react-three-fiber'

// import main script and neural network model from Jeeliz FaceFilter NPM package
import { JEEFACEFILTERAPI, NN_4EXPR } from 'facefilter'

// import THREE.js helper, useful to compute pose
// The helper is not minified, feel free to customize it (and submit pull requests bro):
import { JeelizThreeFiberHelper } from './JeelizThreeFiberHelper.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const _maxFacesDetected = 1 // max number of detected faces
const _faceFollowers = new Array(_maxFacesDetected)
const IMAGE_NAME = "test_cdot.obj";
let _timerResize = null;
let returnVal = null;

// This mesh follows the face. put stuffs in it.
// Its position and orientation is controlled by Jeeliz THREE.js helper

  
function Box({position, color}) {
  const ref = useRef();
  console.log("REF");
  console.log(ref);

  return (
    <mesh position={position} ref={ref}>
      <boxBufferGeometry args={[1, 1, 1]} attach="geometry" />
      <meshPhongMaterial color={color} attach="material" />
    </mesh>
  )
}
  
const FaceFollower = (props) => {
  // This reference will give us direct access to the mesh
  const objRef = useUpdate((threeObject3D) => {
    _faceFollowers[props.faceIndex] = threeObject3D  
  });
    
  console.log("FACE FOLLOWER PROPS", props);
    
    
  const loader = new OBJLoader();

    
  if (props.objFile && props.objFile[0] !== '<') {
      // loader.setPath('./');

      const face = loader.parse(props.objFile);

      // Rotate face by <x> radians
      face.rotation.x = 5/180 * Math.PI;
      face.rotation.y = 5/180 * Math.PI;
      face.rotation.z = 0/180 * Math.PI;
      
      face.scale.set(0.0082,0.0082,0.0082);
      face.position.set(0, -0.2, 0.38);
      
      returnVal = face;
  }
  else {
    loader.load(
        //"cdot_test_dss_inverted_ar.obj",
        "cdot_fitter_bracket_reflected.obj",
        function(object3d) {
            if (returnVal == null)
                returnVal = object3d;
        },
        function(xhr) {
        },
        function(error) {
          console.log(error);
          console.log("error");
        });
        if (returnVal) {
            // console.log(returnVal.children);
            //returnVal.children[0].scale.set(0.03,0.03,0.03);
            returnVal.children[0].scale.set(0.0086,0.0086,0.0086);
            returnVal.children[0].position.set(0, -0.2, 0.38);
    }
      
  }
  
  
    
  return (
    <object3D ref = {objRef}>
      
      {
      returnVal ?
      <primitive object={returnVal} /> :
      <Box />
      }
      
      {/*
      <Suspense fallback={<Box />}>
          <FaceMask url='./test_cdot.obj' />
      </Suspense>
      */}
      
    </object3D>
  )
}


// fake component, display nothing
// just used to get the Camera and the renderer used by React-fiber:
let _threeFiber = null
const DirtyHook = (props) => {
  _threeFiber = useThree()
  useFrame(JeelizThreeFiberHelper.update_camera.bind(null, props.sizing, _threeFiber.camera))
  return null
}


const compute_sizing = () => {
  // compute  size of the canvas:
  const height = window.innerHeight / 2;
  const wWidth = window.innerWidth;
  const width = Math.min(wWidth, height)

  // compute position of the canvas:
  const top = (height / 2);
  const left = (wWidth - width ) / 2
  console.log(width, height, top, left)
  return {width, height, top, left}
}

class AppCanvas extends Component {
  constructor(props) {
    super(props)
            
    // init state:
    const expressions = []
    for (let i = 0; i<_maxFacesDetected; ++i){
      expressions.push({
        mouthOpen: 0,
        mouthSmile: 0,
        eyebrowFrown: 0,
        eyebrowRaised: 0
      })
    }
    this.state = {
      sizing: compute_sizing(),
      expressions
    }

    // handle resizing / orientation change:
    this.handle_resize = this.handle_resize.bind(this)
    this.do_resize = this.do_resize.bind(this)
    window.addEventListener('resize', this.handle_resize)
    window.addEventListener('orientationchange', this.handle_resize)

    // bind this:
    this.callbackReady = this.callbackReady.bind(this)
    this.callbackTrack = this.callbackTrack.bind(this)
  }
        
  handle_resize() {
    // do not resize too often:
    if (_timerResize){
      clearTimeout(_timerResize)
    }
    _timerResize = setTimeout(this.do_resize, 200)
  }

  do_resize(){
    _timerResize = null
    const newSizing = compute_sizing()
    this.setState({sizing: newSizing}, () => {
      if (_timerResize) return
      JEEFACEFILTERAPI.resize()      
    })
  }

  callbackReady(errCode, spec) {
    if (errCode){
      console.log('AN ERROR HAPPENS. ERR =', errCode)
      return
    }

    console.log('INFO: JEEFACEFILTERAPI IS READY')
    // there is only 1 face to track, so 1 face follower:
    JeelizThreeFiberHelper.init(spec, _faceFollowers, this.callbackDetect)    
  }

  callbackTrack(detectStatesArg) {
    // if 1 face detection, wrap in an array:
    const detectStates = (detectStatesArg.length) ? detectStatesArg : [detectStatesArg];

    // update video and THREE faceFollowers poses:
    JeelizThreeFiberHelper.update(detectStates, _threeFiber.camera)

    // render the video texture on the faceFilter canvas:
    JEEFACEFILTERAPI.render_video();

    // get expressions factors:
    detectStates.forEach((detectState, faceIndex) => {
      const expr = detectState.expressions

      const newState = { ...this.state }
      const newExpressions = this.state.expressions.slice(0)
      newState.expressions = newExpressions

      newExpressions[faceIndex] = { // expressions depends on the neural net model
        mouthOpen: expr[0], 
        mouthSmile: expr[1],

        eyebrowFrown: expr[2], // not used here
        eyebrowRaised: expr[3] // not used here
      }

      this.setState(newState)
    })
  }

  componentWillUnmount() {
    JEEFACEFILTERAPI.destroy()
  }

  callbackDetect(faceIndex, isDetected) {
    if (isDetected) {
      console.log('DETECTED')
    } else {
      console.log('LOST')
    }
  }

  componentDidMount(){
    // init FACEFILTER:
    const canvas = this.refs.faceFilterCanvas    
    JEEFACEFILTERAPI.init({
      canvas,
      NNC: NN_4EXPR,
      maxFacesDetected: 1,
      followZRot: true,
      callbackReady: this.callbackReady,
      callbackTrack: this.callbackTrack
    })
  }

  render(){
    // generate canvases:
    console.log("PROPS", this.props);
    return (
      <div style={{visibility: this.props.hide}}>
        {/* Canvas managed by three fiber, for AR: */}
        <Canvas className='mirrorX' style={{
          position: 'fixed',
          zIndex: 2,
          ...this.state.sizing
        }}
        gl={{
          preserveDrawingBuffer: true // allow image capture
        }}>
          <DirtyHook sizing={this.state.sizing} />
          <FaceFollower objFile={this.props.maskfile} faceIndex={0} expressions={this.state.expressions[0]} />
        </Canvas>

      {/* Canvas managed by FaceFilter, just displaying the video (and used for WebGL computations) */}
        <canvas className='mirrorX' ref='faceFilterCanvas' style={{
          position: 'fixed',
          zIndex: 1,
          ...this.state.sizing
        }} width = {this.state.sizing.width} height = {this.state.sizing.height} />
      </div>
    )
  }
} 

export default AppCanvas