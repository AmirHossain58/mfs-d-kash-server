const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const bcrypt= require('bcryptjs')

 
const port = process.env.PORT || 8000
 
// middleware
const corsOptions = {
  origin: ['http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
  optionSuccessStatus: 200,
}
app.use(cors(corsOptions))

app.use(express.json())
app.use(cookieParser())

// Verify Token Middleware
const verifyToken = async (req, res, next) => {
  const token = req.cookies?.token
  if (!token) {
    return res.status(401).send({ message: 'unauthorized access' })
  }
  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      console.log(err)
      return res.status(401).send({ message: 'unauthorized access' })
    }
    req.user = decoded
    next() 
  })
} 

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.4j3msur.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
})

async function run() {
  try {
    const usersCollection=client.db('mfs-d-kash').collection('users')
    const paymentsCollection=client.db('mfs-d-kash').collection('payments')
    const cashInOrOutCollection=client.db('mfs-d-kash').collection('cash-in/out')


    
// Verify Admin Middleware
const verifyAdmin=async(req,res,next)=>{
  const user=req.user
  const query={email:user?.email}
  const result= await usersCollection.findOne(query)
  if(!result|| result?.role!=='admin')return res.status(401).send({message:'unauthorized access'})
    next()
}
// Verify Host Middleware
const verifyHost=async(req,res,next)=>{
  const user=req.user
  const query={email:user?.email}
  const result= await usersCollection.findOne(query)
  if(!result|| result?.role!=='host')return res.status(401).send({message:'unauthorized access'})
    next()
}
    
 


    // auth related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '365d', 
      })
      res
        .cookie('token', token, {
          httpOnly: true,
          secure: process.env.NODE_ENV === 'production',
          sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
        })
        .send({ success: true })
    })
    // Logout
    app.get('/logout', async (req, res) => {
      try {
        res
          .clearCookie('token', {
            maxAge: 0,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
          })
          .send({ success: true })
        console.log('Logout successful')
      } catch (err) {
        res.status(500).send(err)
      }
    })
   
    // save user data
    app.put('/users',async(req,res)=>{
      const user=req.body
      console.log(user);
      const userData={
         ...user,
          pin:await bcrypt.hash(user.pin, 10),
          role:"user"
          
      }
      const  query ={email:user?.email}
      const options={upsert:true}
      const isExist=await usersCollection.findOne({email:user?.email})
      if(isExist){
        if(user.status==='Requested'){
          const result=await usersCollection.updateOne(query,{
            $set:{
              status:user?.status
            }
          })
         return res.send(result)
        }else{
         return res.send(isExist)
          }
        }
      const updateDoc={
        $set:{
          ...userData,
          timeStamp:Date.now()
        }
      }
      const result=await usersCollection.updateOne(query,updateDoc,options)
      res.send(result)
    })

    // send money 
    app.put('/send-money/:email',verifyToken,async(req,res)=>{
      const senderData=req.body
      const email= req.params.email
      let query={email:email}
      const sender =await usersCollection.findOne(query)
      if(!sender){return res.status(401).send({message:'unauthorized access'})}
      let isPinValid;
      if(sender){
        isPinValid = await bcrypt.compare(senderData?.pin, sender?.pin);
        if(isPinValid===false){
          return res.status(401).send({message:'unauthorized access'})
        }
      }
      let query2;
      if (senderData.receiver.includes('@')) {
        query2={email:senderData.receiver}
      }else{
        query2={mobileNumber:senderData.receiver}
      }
      const receiver =await usersCollection.findOne(query2)
      if(!receiver){return res.status(404).send({message:'No user found'})}
      console.log(receiver);
       const updateBalance=await usersCollection.updateOne({email:receiver.email},{ 
        $set:{
          balance:parseInt(receiver.balance)+parseInt(senderData.amount)
        }
      })
      await usersCollection.updateOne({email:sender.email},{
        $set:{
          balance:parseInt(sender.balance)-parseInt(senderData.totalAmount)
        }
      })
      delete senderData.pin
      await paymentsCollection.insertOne({...senderData,balance:parseInt(sender.balance)-parseInt(senderData.totalAmount)})
      
      res.status(200).send({message:'Money Send Successfully'})
    })
    // Cash Out 
    app.put('/cash-out/:email',verifyToken,async(req,res)=>{
      const senderData=req.body
      const email= req.params.email
      let query={email:email}
      const sender =await usersCollection.findOne(query)
      if(!sender){return res.status(401).send({message:'unauthorized access'})}
      let isPinValid;
      if(sender){
        isPinValid = await bcrypt.compare(senderData?.pin, sender?.pin);
        if(isPinValid===false){
          return res.status(401).send({message:'unauthorized access'})
        }
      }
      let query2;
      if (senderData.receiver.includes('@')) {
        query2={email:senderData.receiver}
      }else{
        query2={mobileNumber:senderData.receiver}
      }
      const receiver =await usersCollection.findOne(query2)
  
      if(!receiver ||  receiver.role !=="agent"){return res.status(404).send({message:'No user found'})}
      
       const updateBalance=await usersCollection.updateOne({email:receiver.email},{ 
        $set:{
          balance:parseInt(receiver.balance)+parseInt(senderData.totalAmount)
        }
      })
      await usersCollection.updateOne({email:sender.email},{
        $set:{
          balance:parseInt(sender.balance)-parseInt(senderData.totalAmount)
        }
      })
      delete senderData.pin
      await paymentsCollection.insertOne({...senderData,balance:parseInt(sender.balance)-parseInt(senderData.totalAmount)})
      
      res.status(200).send({message:'Money Send Successfully'})
    })
    // cash in 
    app.post('/cash-in',verifyToken,async(req,res)=>{
      const data=req.body
      let query;
      if (data.agent.includes('@')) {
        query={email:data.agent}
      }else{
        query={mobileNumber:data.agent}
      }
      const agent=await usersCollection.findOne(query)
      if(!agent ||  agent.role !=="agent"){return res.status(404).send({message:'No user found'})}
      const result= await cashInOrOutCollection.insertOne({...data,agentEmail:agent.email,agentMobileNumber:agent.mobileNumber})
      res.send(result)


    })
    // add and get a user info by email Or Mobile from db
    app.put('/users/:emailOrMobile',async(req,res)=>{
      const user=req.body
      console.log(user);
      const emailOrMobile= req.params.emailOrMobile
      let query;
      if (emailOrMobile.includes('@')) {
        query={email:emailOrMobile}
      }else{
        query={mobileNumber:emailOrMobile}
      }
      const result =await usersCollection.findOne(query)
      if(!result){return res.status(401).send({message:'unauthorized access'})}
      let isPinValid;
      if(result){
        isPinValid = await bcrypt.compare(user?.pin, result?.pin);
        if(isPinValid===false){
          return res.status(401).send({message:'unauthorized access'})
        }
        delete result?.pin
      }
      res.send(result) 
    })

    // get a user
    app.get('/users/:email',async(req,res)=>{
      const {email}=req.params
      const query={email}
      const result =await usersCollection.findOne(query)
      if(result){
        delete result.pin
      }
      res.send(result)
    })
    // get all transactions-history 
    app.get('/transactions-history/:email',async(req,res)=>{
      const {email}=req.params
      const query={email}
      const option={sort:{timeStamp:-1 }}
      const result =await paymentsCollection.find(query,option).limit(10)
      .toArray();
      
      res.send(result)
    })
    // get all transactions-management 
    app.get('/transactions-management/:email',async(req,res)=>{
      const {email}=req.params
      const query={agentEmail:email}
      const option={sort:{timeStamp:-1 }}
      const result =await cashInOrOutCollection.find(query,option).toArray();
      
      res.send(result)
    })
    // grt all users
    app.get('/users',verifyToken,async(req,res)=>{
      const result =await usersCollection.find().toArray()
      res.send(result)
    })
    // update a user role 
    app.patch('/users/update/:email',async(req,res)=>{
      const email=req.params.email
      const query={email}
      const data=req.body
      const updatedDoc={
        $set:{
          ...data,timeStamp:Date.now()
        }
      }
      const result=await usersCollection.updateOne(query,updatedDoc)
      res.send(result)
    })

   
    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 })
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    )
  } finally {
    // Ensures that the client will close when you finish/error
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('Hello from mfs-app-D-Cash Server..')
})

app.listen(port, () => {
  console.log(`mfs-app-D-Cash is running on port ${port}`)
})
