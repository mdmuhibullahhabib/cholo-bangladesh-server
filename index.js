require('dotenv').config()
const express = require('express')
const app = express()
const jwt = require('jsonwebtoken')
const cors = require('cors')
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY)
const port = process.env.PORT || 5000
const { MongoClient, ObjectId } = require('mongodb')
const { ServerApiVersion } = require('mongodb')

// middleware
app.use(
  cors({
    origin:[
      "http://localhost:5173",
      "https://cholo-bangladesh-a12c4.web.app/",
    ],
    credentials:true,
  }
))
app.use(express.json())

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.w5eri.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true
  }
})

async function run () {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect()

    const packageCollection = client
      .db('cholo-bangladesh')
      .collection('package')
    const guideApplyCollection = client
      .db('cholo-bangladesh')
      .collection('guides_application')
    const bookedCollection = client.db('cholo-bangladesh').collection('booked')
    const userCollection = client.db('cholo-bangladesh').collection('users')
    const storyCollection = client.db('cholo-bangladesh').collection('story')
    const paymentCollection = client
      .db('cholo-bangladesh')
      .collection('payment')

    // Jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1hr'
      })
      res.send({ token })
    })

    // middleware
    const verifyToken = (req, res, next) => {
      // console.log('inside token', req.headers.authorization)
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'forbidded access' })
      }
      const token = req.headers.authorization.split(' ')[1]
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'forbidden access' })
        }
        req.decoded = decoded
        next()
      })
    }

    // verify Admin
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email
      const query = { email: email }
      const user = await userCollection.findOne(query)
      const isAdmin = user?.role === 'admin'
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      next()
    }

    // user related api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray()
      res.send(result)
    })

    app.post('/users', async (req, res) => {
      const user = req.body
      const query = { email: user.email }
      const existingUser = await userCollection.findOne(query)
      if (existingUser) {
        return res.send({ message: 'user already exists', insertedId: null })
      }
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.get('/users/role/:email', verifyToken, async (req, res) => {
      const email = req.params.email
      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'Unauthorized access' })
      }
      const query = { email: email }
      const user = await userCollection.findOne(query)

      // const admin = user.role === 'admin'
      const role = user.role

      res.send({ role })
    })

    app.patch('/users/role/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const { role } = req.body
      const allowedRoles = ['tourist', 'guide', 'admin']
      if (!allowedRoles.includes(role)) {
        return res.status(400).send({ message: 'Invalid role specified.' })
      }
      const filter = { _id: new ObjectId(id) }
      const updatedDoc = {
        $set: { role: role }
      }
      const result = await userCollection.updateOne(filter, updatedDoc)
      res.send(result)
    })

    app.patch(
      '/users/guide/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id
        const { role } = req.body
        const filter = { _id: new ObjectId(id) }
        const updatedDoc = {
          $set: { role }
        }
        const result = await userCollection.updateOne(filter, updatedDoc)
        res.send(result)
      }
    )

    app.get('/users/guides', async (req, res) => {
      const guides = await userCollection.find({ role: 'guide' }).toArray()
      res.send(guides)
    })

    app.get('/user', async (req, res) => {
      const email = req.query.email
      const result = await userCollection.findOne({ email })
      res.send(result)
    })

    app.put('/users/:id', async (req, res) => {
      const { id } = req.params
      const updateData = req.body
      const result = await userCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updateData }
      )
      res.send(result)
    })

    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await userCollection.deleteOne(query)
      res.send(result)
    })

    // Guide related api
    app.post('/guide/application', async (req, res) => {
      const apply = req.body
      const result = await guideApplyCollection.insertOne(apply)
      res.send(result)
    })

    app.get('/guide/application', async (req, res) => {
      const result = await guideApplyCollection.find().toArray()
      res.send(result)
    })

    app.delete('/guide/application/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await guideApplyCollection.deleteOne(query)
      res.send(result)
    })

    // story related api
    app.post('/story', async (req, res) => {
      const story = req.body
      const result = await storyCollection.insertOne(story)
      res.send(result)
    })

    app.get('/stories', async (req, res) => {
      const result = await storyCollection.find().toArray()
      res.send(result)
    })

    app.get('/story', async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const result = await storyCollection.find(query).toArray()
      res.send(result)
    })

    app.get('/story-random', async (req, res) => {
      const result = await storyCollection
        .aggregate([{ $sample: { size: 4 } }])
        .toArray()
      res.send(result)
    })

    app.delete('/story/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await storyCollection.deleteOne(query)
      res.send(result)
    })

    // Package related api
    app.post('/package', async (req, res) => {
      const package = req.body
      const result = await packageCollection.insertOne(package)
      res.send(result)
    })

    app.get('/package', async (req, res) => {
      const result = await packageCollection.find().toArray()
      res.send(result)
    })

    app.get('/package/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await packageCollection.findOne(query)
      res.send(result)
    })

    app.get('/random-packages', async (req, res) => {
      const result = await packageCollection
        .aggregate([{ $sample: { size: 3 } }])
        .toArray()
      res.send(result)
    })

    // booked related api
    app.post('/booked', async (req, res) => {
      const booked = req.body
      const result = await bookedCollection.insertOne(booked)
      res.send(result)
    })

    app.get('/assigned-tours/:name', async (req, res) => {
      const name = req.params.name
      const result = await bookedCollection
        .find({ tourGuideName: name })
        .toArray()
      res.send(result)
    })

    app.get('/booked', async (req, res) => {
      const email = req.query.email
      const query = { email: email }
      const result = await bookedCollection.find(query).toArray()
      res.send(result)
    })

    app.patch('/booked/:id', async (req, res) => {
      const id = req.params.id
      const result = await bookedCollection.updateOne(
        { _id: new ObjectId(id), status: 'pending' },
        { $set: { status: 'in-review' } }
      )
      res.send(result)
    })

    app.delete('/booked/:id', async (req, res) => {
      const id = req.params.id
      const query = { _id: new ObjectId(id) }
      const result = await bookedCollection.deleteOne(query)
      res.send(result)
    })

    // guide related api
    //  Accept
    app.patch('/assigned-tours/accept-by-menu/:menuId', async (req, res) => {
      const menuId = req.params.menuId

      const bookingResult = await bookedCollection.updateOne(
        { menuId: menuId, status: 'in-review' },
        { $set: { status: 'accepted' } }
      )

      const paymentResult = await paymentCollection.updateOne(
        { menuId: menuId },
        { $set: { status: 'accepted' } }
      )

      res.send({ bookingResult, paymentResult })
    })

    //  Reject
    app.patch('/assigned-tours/reject-by-menu/:menuId', async (req, res) => {
      const menuId = req.params.menuId

      const bookingResult = await bookedCollection.updateOne(
        { menuId: menuId, status: 'in-review' },
        { $set: { status: 'rejected' } }
      )

      const paymentResult = await paymentCollection.updateOne(
        { menuId: menuId },
        { $set: { status: 'rejected' } }
      )

      res.send({ bookingResult, paymentResult })
    })

    // Payment intent
    app.post('/create-payment-intent', async (req, res) => {
      const { price } = req.body
      const amount = parseInt(price * 100)

      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: 'usd',
        payment_method_types: ['card']
      })

      res.send({
        clientSecret: paymentIntent.client_secret
      })
    })

    app.post('/payment', async (req, res) => {
      const payment = req.body
      const paymentResult = await paymentCollection.insertOne(payment)

      res.send({ paymentResult })
    })

    app.get('/payment', async (req, res) => {
      const result = await paymentCollection.find().toArray()
      res.send(result)
    })

    // Send a ping to confirm a successful connection
    // await client.db('admin').command({ ping: 1 })
    // console.log(
    //   'Pinged your deployment. You successfully connected to MongoDB!'
    // )
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir)

app.get('/', (req, res) => {
  res.send('fly with us herooooooooooo')
})

app.listen(port, () => {
  console.log(`fly with us on port ${port}`)
})
