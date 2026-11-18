<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>RealLife Application Portal</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-9ndCyUaIbzAi2FUVXJi0CjmCapSmO7SnpJef0486qhLnuZ2cdeRhO02iuK6FUUVM" crossorigin="anonymous">
  </head>

  <body>

    <div class="header">
      <div class="row">
        <nav class="navbar navbar-dark fixed-top" style="background-color: #71bf43; height: 5em;">
          <div class="container-fluid">
            <a class="navbar-brand" href="#">
              <img src="assets\rl\Logo\Real LIFE Logo black.png" alt="Logo" style="width: 5cm; ">
            </a>
            <button class="navbar-toggler" type="button" data-bs-toggle="offcanvas" data-bs-target="#offcanvasDarkNavbar" aria-controls="offcanvasDarkNavbar" aria-label="Toggle navigation">
              <span class="navbar-toggler-icon"></span>
            </button>

            <div class="offcanvas offcanvas-end text-bg-dark" tabindex="-1" id="offcanvasDarkNavbar" aria-labelledby="offcanvasDarkNavbarLabel" style="background-color: #71bf43;">
              <div class="offcanvas-header">
                <h5 class="offcanvas-title" id="offcanvasDarkNavbarLabel">Menu</h5>
                <button type="button" class="btn-close btn-close-white" data-bs-dismiss="offcanvas" aria-label="Close"></button>
              </div>

              <!-- Navbar
              -->
              <div class="offcanvas-body" style="background-color: #71bf43;">
                <ul class="navbar-nav justify-content-end flex-grow-1 pe-3">
                  <li class="nav-item">
                    <a class="nav-link active" aria-current="page" href="#">Log in</a>
                  </li>

                  <li class="nav-item">
                    <a class="nav-link" href="#">Home</a>
                  </li>

                  <li class="nav-item">
                    <a class="nav-link" href="#">Announcements</a>
                  </li>

                  <li class="nav-item">
                    <a class="nav-link" href="#">Frequently Asked Questions</a>
                  </li>
                  
                  <!--
                    This nav dropdown button is reserved for more features

                  <li class="nav-item dropdown">
                    <a class="nav-link dropdown-toggle" href="#" role="button" data-bs-toggle="dropdown" aria-expanded="false">
                      Dropdown
                    </a>
                    <ul class="dropdown-menu dropdown-menu-dark">
                      <li><a class="dropdown-item" href="#">Action</a></li>
                      <li><a class="dropdown-item" href="#">Another action</a></li>
                      <li>
                        <hr class="dropdown-divider">
                      </li>
                      <li><a class="dropdown-item" href="#">Something else here</a></li>
                    </ul>
                  </li>
                  -->
                </ul>
                <form class="d-flex mt-3" role="search">
                  <input class="form-control me-2" type="search" placeholder="Search" aria-label="Search">
                  <button class="btn btn-success" type="submit">Search</button>
                </form>
              </div>
            </div>
          </div>
        </nav>  
      </div>
    </div>

    <div class="signInBody" style="padding-top: 6em;">
      <div class="container-fluid">
        <div class="row">
            <!-- Left side for signing -->
            <div class="col-md-9 ">
              <p>This is the right side (3/4).</p>

              <div class="login-form-container">
                <div class="login-form d-flex flex-column">
                  <form class="d-flex flex-column ng-valid ng-dirty ng-touched" novalidate="">
                    <!---->
                    <label class="sub-section-title-primary" for="username">Email Address</label>
                    <input formcontrolname="username" id="username" name="username" type="text">
                    <label class="sub-section-title-primary pt-20" for="password">Password</label>
                    <input formcontrolname="password" id="password" name="password" type="password">
                    <p class="ml-auto pt-10 sub-section-title-secondary" style="cursor: pointer;"><a href="applicant_info.html">Create an account</a></p>
                    <div class="pt-20 text-center"> 
                      <button class="button-sign-in btn btn-primary " type="submit" > Sign In</button>
                    </div>
                  </form>
                </div>
              </div>
          </div>
            <!-- Right side for bg -->
            <div class="col-md-3 ">
              <p>This is the left side (1/4).</p>
              <img src="assets\rl\testSamplePics.jpg" alt="Image" style="height: 30em; width: auto;">
          </div>
        </div>
    </div>


    </div>


    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js" integrity="sha384-geWF76RCwLtnZ8qwWowPQNguL3RmwHVBC9FhGdlKrxdiJJigb/j/68SIy3Te4Bkz" crossorigin="anonymous"></script>
  
  </body>
</html>