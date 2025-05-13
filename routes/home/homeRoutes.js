const homeControllers = require('../../controllers/home/homeControllers') 
const router = require('express').Router()

/*router.get('/get-categorys',homeControllers.get_categorys)
router.get('/get-products',homeControllers.get_products)
router.get('/price-range-latest-product',homeControllers.price_range_product)
router.get('/query-products',homeControllers.query_products)
router.get('/product-details/:slug',homeControllers.product_details)

router.post('/customer/submit-review',homeControllers.submit_review)
router.get('/customer/get-reviews/:productId',homeControllers.get_reviews)


router.get('/price-range-latest-service', homeControllers.price_range_service);
router.get('/query-services', homeControllers.query_services);*/
router.get('/get-categorys', homeControllers.get_categorys);
router.get('/get-service-categories', homeControllers.get_service_categories);
router.get('/get-products', homeControllers.get_products);
router.get('/price-range-latest-product', homeControllers.price_range_product);
router.get('/price-range-latest-service', homeControllers.price_range_service);
router.get('/query-products', homeControllers.query_products);
router.get('/query-services', homeControllers.query_services);
router.get('/product-details/:slug', homeControllers.product_details);
router.post('/customer/submit-review', homeControllers.submit_review);
router.get('/customer/get-reviews/:productId', homeControllers.get_reviews);
router.get('/banners', homeControllers.get_banners);
router.get('/service-details/:slug', homeControllers.service_details);
router.post('/customer/delete-review', homeControllers.delete_review);
  

module.exports = router 