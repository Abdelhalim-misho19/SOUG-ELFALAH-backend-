const mongoose = require('mongoose');

module.exports.dbConnect = async()=>{
    try {
       if (process.env.mode === 'pro'){
        await mongoose.connect(process.env.DB_PRO_URL,{useNewUrLParser:true,})
        console.log('production database connected.......')
       }else{
         await mongoose.connect(process.env.DB_LOCAL_URL,{useNewUrLParser:true,})
        console.log('local database connected.......')
       }
    } catch (error) {
        console.log(error.message)
    }
}