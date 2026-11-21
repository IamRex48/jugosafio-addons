function keepClosedPipeFromCrashing(stream){
  stream?.on('error',error=>{if(error.code!=='EPIPE')throw error;});
}
keepClosedPipeFromCrashing(process.stdout);
keepClosedPipeFromCrashing(process.stderr);
module.exports={keepClosedPipeFromCrashing};
